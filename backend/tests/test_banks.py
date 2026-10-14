import unittest

from app.banks import UNKNOWN_BANK, detect_bank, normalize_bank


class BankDetectionTests(unittest.TestCase):
    def test_detects_alias_from_filename(self):
        result = detect_bank("NTT_Data_Draft_TSD_BCA_RWA.docx", "")
        self.assertEqual(result["suggestion"], "Bank Central Asia")
        self.assertEqual(result["confidence"], "medium")

    def test_prefers_explicit_document_label(self):
        result = detect_bank("NTT_Data_Draft_TSD_RWA.docx", "Nama Bank: Bank Mandiri\nDokumen TSD")
        self.assertEqual(result["suggestion"], "Bank Mandiri")
        self.assertEqual(result["confidence"], "high")

    def test_unknown_document_requires_confirmation(self):
        result = detect_bank("NTT_Data_Draft_TSD_F01.docx", "Technical Specification Document")
        self.assertEqual(result["suggestion"], UNKNOWN_BANK)
        self.assertEqual(result["confidence"], "low")

    def test_normalizes_common_alias(self):
        self.assertEqual(normalize_bank(" bri "), "Bank Rakyat Indonesia")


if __name__ == "__main__":
    unittest.main()
