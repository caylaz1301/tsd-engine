import unittest

from app.banks import KNOWN_BANKS, UNKNOWN_BANK, detect_bank, normalize_bank


class BankDetectionTests(unittest.TestCase):
    def test_detects_supported_bank_from_filename(self):
        result = detect_bank("NTT_Data_Draft_TSD_DBS_RWA.docx", "")
        self.assertEqual(result["suggestion"], "DBS")

    def test_prefers_explicit_document_label(self):
        result = detect_bank("NTT_Data_Draft_TSD_RWA.docx", "Nama Bank: Standard Chartered Bank\nDokumen TSD")
        self.assertEqual(result["suggestion"], "SCB")
        self.assertEqual(result["confidence"], "high")

    def test_unknown_document_requires_confirmation(self):
        result = detect_bank("NTT_Data_Draft_TSD_F01.docx", "Technical Specification Document")
        self.assertEqual(result["suggestion"], UNKNOWN_BANK)

    def test_only_project_banks_are_accepted(self):
        self.assertEqual(KNOWN_BANKS, ("SCB", "DBS", "SMBCI"))
        self.assertEqual(normalize_bank("standard chartered"), "SCB")
        with self.assertRaises(ValueError):
            normalize_bank("BCA")


if __name__ == "__main__":
    unittest.main()
