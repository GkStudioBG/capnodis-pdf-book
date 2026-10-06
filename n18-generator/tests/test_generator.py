"""All financial identities and amounts here are synthetic test data."""
import copy
import csv
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from lxml import etree

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'n18.py'
XSD = ROOT.parent / 'NRA_REFERENCE/official_xsd_xml/XSD_XML/dec_audit.xsd'


def synthetic():
    return {
        'header': {'eik': '000000000', 'e_shop_n': 'TEST000001', 'domain_name': 'example.invalid',
                   'e_shop_type': 1, 'creation_date': '2026-10-06', 'mon': '09', 'god': 2026},
        'approvals': {'reporting_currency': 'EUR', 'currency_policy_reference': 'SYNTHETIC test policy',
                      'tax_policy_reference': 'SYNTHETIC tax policy',
                      'document_numbering_reference': 'SYNTHETIC numbering register',
                      'scope_reference': 'SYNTHETIC delivery scope',
                      'refund_review_reference': 'SYNTHETIC refunds reviewed'},
        'orders': [{'ord_n': 'TEST-ORDER-1', 'ord_d': '2026-08-31', 'doc_n': '101',
                    'doc_date': '2026-09-01', 'delivery_date': '2026-09-01',
                    'ord_total1': '10.00', 'ord_disc': '0.00', 'ord_vat': '2.00',
                    'ord_total2': '12.00', 'paym': 4, 'trans_n': 'TEST-TXN',
                    'proc_id': 'TEST-PROCESSOR',
                    'articles': [{'art_name': 'Синтетичен тест & <sample>', 'art_quant': '1.00',
                                  'art_price': '10.00', 'art_vat_rate': 20,
                                  'art_vat': '2.00', 'art_sum': '12.00'}]}],
        'refunds': [{'r_ord_n': 'TEST-PRIOR-ORDER', 'r_amount': '3.00',
                     'r_date': '2026-09-02', 'r_paym': 2}]}


class GeneratorTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)

    def run_cli(self, data, command='generate'):
        source = self.folder / 'input.json'
        source.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        out = self.folder / ('audit.xml' if command == 'generate' else 'prepared.json')
        result = subprocess.run([sys.executable, str(SCRIPT), command, '--input', str(source),
                                 '--output', str(out)], capture_output=True, text=True)
        return result, out

    def test_schema_valid_output_preserves_supplied_document_dates_and_cyrillic(self):
        result, out = self.run_cli(synthetic())
        self.assertEqual(result.returncode, 0, result.stderr)
        doc = etree.parse(str(out))
        etree.XMLSchema(etree.parse(str(XSD))).assertValid(doc)
        self.assertEqual(doc.findtext('order/orderenum/doc_n'), '101')
        self.assertEqual(doc.findtext('order/orderenum/doc_date'), '2026-09-01')
        self.assertEqual(doc.findtext('order/orderenum/art/artenum/art_name'), 'Синтетичен тест & <sample>')
        self.assertIsNone(doc.find('approvals'))
        self.assertEqual(doc.findtext('r_total'), '3.00')

    def test_missing_store_fails_without_xml(self):
        data = synthetic(); del data['header']['e_shop_n']
        result, out = self.run_cli(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('header.e_shop_n', result.stderr)
        self.assertFalse(out.exists())

    def test_prepare_reports_missing_data_without_fabricating_xml(self):
        result, out = self.run_cli({'orders': []}, 'prepare')
        self.assertEqual(result.returncode, 0, result.stderr)
        prepared = json.loads(out.read_text(encoding='utf-8'))
        self.assertIn('header.e_shop_n', prepared['issues'])
        self.assertIsNone(prepared['input']['header']['e_shop_n'])
        self.assertFalse((self.folder / 'audit.xml').exists())

    def test_no_currency_or_tax_or_numbering_inference(self):
        for key in ('reporting_currency', 'currency_policy_reference', 'tax_policy_reference',
                    'document_numbering_reference'):
            with self.subTest(key=key):
                data = synthetic(); del data['approvals'][key]
                result, out = self.run_cli(data)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('approvals.' + key, result.stderr)
                self.assertFalse(out.exists())

    def test_schema_rejects_invalid_enum_and_length(self):
        for key, value in [('paym', 7), ('doc_n', 'cs_test_fake'), ('doc_date', 'yesterday')]:
            with self.subTest(key=key):
                data = synthetic(); data['orders'][0][key] = value
                result, out = self.run_cli(data)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(out.exists())

    def test_decimal_precision_not_silently_rounded(self):
        data = synthetic(); data['orders'][0]['articles'][0]['art_price'] = '10.001'
        result, out = self.run_cli(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(out.exists())

    def test_stripe_fee_never_becomes_discount(self):
        data = synthetic(); data['orders'][0]['stripe_fee'] = '0.40'; del data['orders'][0]['ord_disc']
        result, out = self.run_cli(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ord_disc', result.stderr)
        self.assertFalse(out.exists())

    def test_duplicate_documents_and_orders_rejected(self):
        data = synthetic(); data['orders'].append(copy.deepcopy(data['orders'][0]))
        result, out = self.run_cli(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('duplicate', result.stderr.lower())
        self.assertFalse(out.exists())

    def test_wrong_delivery_period_rejected(self):
        data = synthetic(); data['orders'][0]['delivery_date'] = '2026-10-01'
        result, out = self.run_cli(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('delivery_date', result.stderr)
        self.assertFalse(out.exists())

    def test_wrong_refund_period_rejected(self):
        data = synthetic(); data['refunds'][0]['r_date'] = '2026-10-01'
        result, out = self.run_cli(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(out.exists())

    def test_inconsistent_totals_rejected(self):
        data = synthetic(); data['orders'][0]['ord_total2'] = '11.00'
        result, out = self.run_cli(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('total', result.stderr)
        self.assertFalse(out.exists())

    def test_existing_output_not_overwritten(self):
        out = self.folder / 'audit.xml'; out.write_text('keep', encoding='utf-8')
        result, _ = self.run_cli(synthetic())
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(out.read_text(encoding='utf-8'), 'keep')

    def test_csv_groups_articles_without_inventing_order_fields(self):
        data = synthetic(); row = dict(data['orders'][0]); articles = row.pop('articles')
        row.update(articles[0]); row['art_price'] = '10,00'
        source = self.folder / 'input.csv'
        with source.open('w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=list(row)); writer.writeheader(); writer.writerow(row)
        config = self.folder / 'config.json'
        config.write_text(json.dumps({k: v for k, v in data.items() if k != 'orders'}), encoding='utf-8')
        out = self.folder / 'csv.xml'
        result = subprocess.run([sys.executable, str(SCRIPT), 'generate', '--input', str(source),
                                 '--config', str(config), '--output', str(out)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(etree.parse(str(out)).findtext('order/orderenum/art/artenum/art_price'), '10.00')


if __name__ == '__main__':
    unittest.main()
