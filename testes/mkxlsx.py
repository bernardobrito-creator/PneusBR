import csv, io, re, sys, base64, openpyxl
txt = open(sys.argv[1], encoding='utf-8').read()
parts = re.split(r'^## Sheet name:\s*(.+)$', txt, flags=re.M)
wb = openpyxl.Workbook(); wb.remove(wb.active)
def conv(v):
    m = re.fullmatch(r'R\$\s*([\d\s .]*\d,\d{2})', v.strip())
    if m:
        return float(re.sub(r'[\s .]', '', m.group(1)).replace(',', '.'))
    if re.fullmatch(r'\d{4,6}', v.strip()): return int(v)
    return v
for i in range(1, len(parts), 2):
    ws = wb.create_sheet(parts[i].strip()[:31])
    body = parts[i+1].lstrip('\n')
    for row in csv.reader(io.StringIO(body)):
        ws.append([conv(c) if c != '' else None for c in row])
out = io.BytesIO(); wb.save(out)
open('planilha.xlsx.b64', 'w').write(base64.b64encode(out.getvalue()).decode())
print('sheets', wb.sheetnames, 'bytes', len(out.getvalue()))
