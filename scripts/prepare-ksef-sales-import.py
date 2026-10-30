"""Prepare missing Bill sales from verified KSeF metadata/XML; never issue or send.

Usage: python prepare-ksef-sales-import.py INPUT_DIRECTORY
INPUT_DIRECTORY contains inventory.json, batch-*.json and before.json.
Writes records.json and reconciliation.json in the same (private) directory.
Existing Bill rows are retained, including source links, corrections and payments.
"""
import base64
import hashlib
import json
import re
import sys
import uuid
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import xml.etree.ElementTree as ET

NIP = '6351861297'
NAMESPACE = uuid.UUID('761f6862-68ec-4cb2-a301-103b82e3d15b')

def dec(value):
    return Decimal(value)

def cents(value):
    return int((dec(value) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))

def compact(value):
    return format(dec(value).normalize(), 'f')

def parse_sale(metadata, document, owner):
    xml = document['xml']
    assert document['ksefNumber'] == metadata['ksefNumber']
    assert document['hash'] == metadata['invoiceHash'], 'KSeF hash mismatch'
    assert base64.b64encode(hashlib.sha256(xml.encode()).digest()).decode() == document['hash'], 'XML bytes mismatch'
    assert '<!DOCTYPE' not in xml.upper(), 'DOCTYPE is not accepted'
    root = ET.fromstring(xml)
    ns = {'n': root.tag[1:].split('}')[0]}
    def get(node, path, default=''):
        return node.findtext('/'.join('n:' + part for part in path.split('/')), default, ns) if node is not None else default
    def all_nodes(node, name):
        return node.findall('n:' + name, ns)
    fa = root.find('n:Fa', ns)
    assert get(root, 'Podmiot1/DaneIdentyfikacyjne/NIP') == NIP == metadata['seller']['nip']
    assert get(fa, 'P_2') == metadata['invoiceNumber']
    assert get(fa, 'P_1') == metadata['issueDate'] and '2026-01-01' <= metadata['issueDate'] <= '2026-10-30'
    assert get(fa, 'KodWaluty') == metadata['currency']
    assert cents(get(fa, 'P_15')) == cents(str(metadata['grossAmount']))
    assert get(fa, 'RodzajFaktury') == 'VAT', 'New correction requires explicit original linkage; do not guess'
    def party(node):
        ident = node.find('n:DaneIdentyfikacyjne', ns)
        country = get(node, 'Adres/KodKraju', 'PL')
        nip = get(ident, 'NIP') or get(ident, 'KodUE') + get(ident, 'NrVatUE')
        address, city = get(node, 'Adres/AdresL1'), get(node, 'Adres/AdresL2')
        if not city:
            match = re.match(r'^(.*?)[,\s]+(\d{2}-\d{3}\s+.+)$', address)
            if match:
                address, city = match.group(1).rstrip(', '), match.group(2)
        assert address and city, 'Address must be split without inventing a city'
        return dict(kind='company' if nip else 'person', name=get(ident, 'Nazwa'), nip=nip,
                    address=address, city=city, country=country, email=get(node, 'DaneKontaktowe/Email'),
                    phone=get(node, 'DaneKontaktowe/Telefon'), regon='', krs='')
    buyer = party(root.find('n:Podmiot2', ns))
    metadata_id = str(metadata['buyer']['identifier'].get('value', ''))
    assert buyer['nip'] == metadata_id or (not buyer['nip'] and metadata['buyer']['identifier']['type'] == 'None')
    recipient_nodes = [p for p in all_nodes(root, 'Podmiot3') if get(p, 'Rola') == '2']
    assert len(recipient_nodes) <= 1
    recipient = party(recipient_nodes[0]) if recipient_nodes else None
    lines = []
    for row in all_nodes(fa, 'FaWiersz'):
        assert get(row, 'StanPrzed') != '1'
        assert get(row, 'P_12') == 'zw', 'Do not relabel original tax treatment'
        qty = compact(get(row, 'P_8B'))
        price = get(row, 'P_9A') or get(row, 'P_9B')
        amount = get(row, 'P_11') or get(row, 'P_11A')
        line = dict(name=get(row, 'P_7'), unit=get(row, 'P_8A'), qty=qty, price=f'{dec(price):.2f}')
        rounded = cents(dec(qty) * dec(price))
        adjustment = rounded - cents(amount)
        if adjustment:
            line['discount'] = f'{Decimal(adjustment) / 100:.2f}'
        assert dec(qty) > 0 and len(qty.partition('.')[2]) <= 3
        lines.append(line)
    assert lines and sum(cents(dec(l['qty']) * dec(l['price'])) - cents(l.get('discount', '0')) for l in lines) == cents(get(fa, 'P_15'))
    payment = fa.find('n:Platnosc', ns)
    form = get(payment, 'FormaPlatnosci')
    assert form in ('', '1', '2', '6'), 'Unsupported payment form must not be guessed'
    bank = get(payment, 'RachunekBankowy/NrRB').removeprefix('PL')
    notes = '\n'.join(get(d, 'Klucz') + ': ' + get(d, 'Wartosc') for d in all_nodes(fa, 'DodatkowyOpis'))
    issue = get(fa, 'P_1')
    payload = dict(brand='robisie' if any(re.search(r'remont|montaż mebli', l['name'], re.I) for l in lines) else 'cleanfleet',
        issueDate=issue, saleDate=get(fa, 'P_6'), dueDate=get(payment, 'TerminPlatnosci/Termin'),
        currency=metadata['currency'], buyer=buyer, recipient=recipient, lines=lines,
        payment={'1': 'cash', '2': 'card', '6': 'transfer', '': 'unspecified'}[form], bank=bank,
        notes=notes, vatTreatment='exempt', source=dict(app='external', id=metadata['ksefNumber'], externalKsefStatus='ksef'),
        externalOriginal=dict(system=get(root, 'Naglowek/SystemInfo'), ksefMetadata=metadata,
            exemption=get(fa, 'Adnotacje/Zwolnienie/P_19A'), originalPayment=ET.tostring(payment, encoding='unicode') if payment is not None else '',
            importedFromKsef=True, importBatch='sales-2026-through-2026-10-30'))
    assert payload['saleDate'] and payload['dueDate']
    return dict(id=str(uuid.uuid5(NAMESPACE, metadata['ksefNumber'])), creator_id=owner,
        number=metadata['invoiceNumber'], status='accepted', ksef_number=metadata['ksefNumber'],
        payload=payload, xml=xml, created_at=metadata['invoicingDate'],
        ksef_message='Faktura zaimportowana z KSeF. Zachowano oryginalny numer, XML i dane dokumentu.')

def prepare(folder):
    meta = json.loads((folder / 'inventory.json').read_text())['invoices']
    docs = {d['ksefNumber']: d for f in folder.glob('batch-*.json') for d in json.loads(f.read_text())['documents']}
    old = json.loads((folder / 'before.json').read_text())
    owners = {r['creator_id'] for r in old}
    assert len(owners) == 1, 'Select one authorized Bill owner'
    owner = next(iter(owners))
    known = {r['ksef_number']: r for r in old if r['ksef_number']}
    numbers = {r['number']: r for r in old if r['number']}
    assert len(docs) == len(meta) == len({m['ksefNumber'] for m in meta})
    records, matched = [], []
    for m in meta:
        doc = docs[m['ksefNumber']]
        assert doc['hash'] == m['invoiceHash']
        assert base64.b64encode(hashlib.sha256(doc['xml'].encode()).digest()).decode() == m['invoiceHash']
        if m['ksefNumber'] in known:
            r = known[m['ksefNumber']]
            assert r['number'] == m['invoiceNumber'] and r['status'] == 'accepted'
            assert hashlib.md5(doc['xml'].encode()).hexdigest() == r['xml_md5'], 'Existing XML differs'
            matched.append(r['number'])
            continue
        assert m['invoiceNumber'] not in numbers, 'Same number with different KSeF identity'
        records.append(parse_sale(m, doc, owner))
    report = dict(ksef_count=len(meta), existing_count=len(matched), import_count=len(records),
        ksef_invoices=sum(m['invoiceType'] == 'Vat' for m in meta), ksef_corrections=sum(m['invoiceType'] == 'Kor' for m in meta),
        existing=matched, imported=[r['number'] for r in records],
        source_totals={c: str(sum(dec(str(m['grossAmount'])) for m in meta if m['currency'] == c)) for c in sorted({m['currency'] for m in meta})})
    (folder / 'records.json').write_text(json.dumps(records, ensure_ascii=False))
    (folder / 'reconciliation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    return report

if __name__ == '__main__':
    print(json.dumps(prepare(Path(sys.argv[1])), ensure_ascii=False, indent=2))
