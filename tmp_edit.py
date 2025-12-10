from pathlib import Path
path = Path('app/dashboard/sales/new/page.tsx')
text = path.read_text()
text = text.replace('\\r\\n', '\n')
path.write_text(text)
