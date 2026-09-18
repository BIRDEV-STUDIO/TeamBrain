import json, os, re, subprocess, sys, zipfile
from xml.etree import ElementTree as ET
def decode(data):
    for encoding in ('utf-8-sig', 'utf-8', 'cp1254', 'latin-1'):
        try: return data.decode(encoding)
        except UnicodeDecodeError: pass
    return data.decode('utf-8', errors='replace')
def xml_text(data):
    root = ET.fromstring(data)
    return '\n'.join(''.join(node.itertext()).strip() for node in root.iter() if node.tag.endswith('}p') and ''.join(node.itertext()).strip())
def office(path, kind):
    with zipfile.ZipFile(path) as archive:
        if kind == 'docx': return xml_text(archive.read('word/document.xml'))
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            root = ET.fromstring(archive.read('xl/sharedStrings.xml')); shared = [''.join(node.itertext()) for node in root if node.tag.endswith('}si')]
        rows = []
        for sheet in sorted(name for name in archive.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', name)):
            root = ET.fromstring(archive.read(sheet))
            for row in root.iter():
                if not row.tag.endswith('}row'): continue
                values = []
                for cell in row:
                    if not cell.tag.endswith('}c'): continue
                    value = next((node.text or '' for node in cell if node.tag.endswith('}v')), '')
                    if cell.attrib.get('t') == 's' and value.isdigit() and int(value) < len(shared): value = shared[int(value)]
                    values.append(value)
                if values: rows.append('\t'.join(values))
        return '\n'.join(rows)
def extract(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.txt', '.md', '.csv', '.tsv', '.json', '.log'): return decode(open(path, 'rb').read())
    if ext == '.docx': return office(path, 'docx')
    if ext in ('.xlsx', '.xlsm'): return office(path, 'xlsx')
    if ext == '.pdf':
        try:
            import pypdf
            return '\n\n'.join(page.extract_text() or '' for page in pypdf.PdfReader(path).pages)
        except ImportError:
            result = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, encoding='utf-8', errors='replace')
            if result.returncode == 0: return result.stdout
            raise RuntimeError('PDF metni için pypdf veya pdftotext kurulmalı.')
    raise RuntimeError('Desteklenmeyen dosya türü.')
try:
    text = extract(sys.argv[1]).replace('\x00', '').strip(); print(json.dumps({'text': text, 'characters': len(text)}))
except Exception as error:
    print(json.dumps({'error': str(error)})); sys.exit(1)
