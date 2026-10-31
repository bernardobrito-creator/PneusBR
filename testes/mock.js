// Mock of window.claude for local testing (db, user, mcp, downloads, permissions)
(function(){
  const store = new Map(); const listeners = new Set();
  const segs = p => p.split('/');
  const snapDoc = (path) => { const d = store.get(path); return { id: segs(path).pop(), exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : undefined, metadata: { fromCache: false, hasPendingWrites: false } }; };
  function notify(){ for (const l of listeners) queueMicrotask(l); }
  function docRef(path){ return {
    id: segs(path).pop(), path,
    get: async () => snapDoc(path),
    set: async (data) => { if (window.__falharGravacao) throw {code:'unavailable', message:'x'}; store.set(path, JSON.parse(JSON.stringify(data))); notify(); },
    update: async (data) => { if (!store.has(path)) throw {code:'invalid_argument'}; store.set(path, {...store.get(path), ...data}); notify(); },
    delete: async () => { store.delete(path); notify(); },
    onSnapshot(next){ const f = () => next(snapDoc(path)); listeners.add(f); queueMicrotask(f); return () => listeners.delete(f); },
    collection: (sub) => collRef(path + '/' + sub)
  }; }
  function collRef(path, filters = []){
    const n = segs(path).length;
    const match = () => [...store.keys()].filter(k => { const s = segs(k); return s.length === n + 1 && k.startsWith(path + '/'); })
      .filter(k => filters.every(([f, op, v]) => { const x = store.get(k)[f]; return op === '>=' ? x >= v : op === '<' ? x < v : op === '<=' ? x <= v : op === '>' ? x > v : op === '==' ? x === v : true; })).sort();
    let prev = new Map();
    const q = {
      path,
      where: (f, op, v) => collRef(path, [...filters, [f, op, v]]),
      orderBy(){ return q; }, limit(){ return q; },
      doc: (id) => docRef(path + '/' + (id || Math.random().toString(36).slice(2))),
      get: async () => { const docs = match().map(snapDoc); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }; },
      onSnapshot(next){ const f = () => { const docs = match().map(snapDoc); const ids = new Set(docs.map(d => d.id)); const ch = []; for (const d of docs) ch.push({ type: prev.has(d.id) ? 'modified' : 'added', doc: d }); for (const [id, d] of prev) if (!ids.has(id)) ch.push({ type: 'removed', doc: d }); prev = new Map(docs.map(d => [d.id, d])); next({ docs, size: docs.length, empty: !docs.length, docChanges: () => ch, metadata: { fromCache: false, hasPendingWrites: false } }); }; listeners.add(f); queueMicrotask(f); return () => listeners.delete(f); }
    };
    return q;
  }
  const db = { doc: docRef, collection: (p) => collRef(p) };
  const mcp = {
    calls: [],
    async callTool(server, tool, input){
      mcp.calls.push({ server, tool, input });
      if (server !== 'Google Drive') throw { code: 'not_in_manifest' };
      if (tool === 'download_file_content') { if (!window.__xlsxB64) throw { code: 'upstream_error', message: 'export falhou' }; return { content: [{ type: 'text', text: '{}' }], payload: { id: input.fileId, title: 'Precificação', mimeType: input.exportMimeType, content: window.__xlsxB64 } }; }
      if (tool === 'read_file_content') return { content: [{ type: 'text', text: window.__txt }], payload: window.__txt };
      throw { code: 'not_in_manifest' };
    }
  };
  const caps = {
    db, mcp,
    user: { id: async () => 'u_teste000000000000000000', can: async () => true, isOwner: async () => true },
    downloads: { save: async (r) => { window.__downloads = (window.__downloads || []).concat([{ filename: r.filename, size: (r.data.length || r.data.size) }]); return { status: 'saved' }; } },
    permissions: { state: async () => window.__perm || 'granted', request: async () => ({}) }
  };
  window.claude = { use: (n) => new Promise(ok => setTimeout(() => ok(caps[n] || null), 30)) };
  window.__store = store;
  window.__pbrTeste = (api) => { window.__api = api; };
})();
