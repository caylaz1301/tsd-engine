"""Regression tests against the TSD examples that exposed missing diagrams."""

import tempfile
import unittest
from pathlib import Path

from app.parsers.docx_parser import parse


SAMPLES = Path(__file__).resolve().parents[1] / "samples"


class DiagramStatusTests(unittest.TestCase):
    def test_explicitly_unavailable_diagrams(self):
        cases = (
            ("NTT_Data_Draft_LLL-DM_LLL_Update_Asset.docx", "sp_update_tbl_asset_cust_limit_cat"),
            ("NTT_Data_Draft_TSD_BASEL3-BASEL3_IFROS_TBLS_TO_BASEL3.docx", "uspi_queued_from_basel3"),
        )
        with tempfile.TemporaryDirectory() as images:
            for filename, name in cases:
                with self.subTest(filename=filename):
                    document = parse(SAMPLES / filename, Path(images))
                    procedure = next(p for p in document["procedures"] if p["sp_name_lower"] == name)
                    for kind in ("data_model", "data_flow"):
                        self.assertEqual(procedure[kind]["status"], "not_available")
                        self.assertFalse(procedure[kind]["images"])

    def test_diagram_without_own_narrative_is_not_assigned_parent_narrative(self):
        with tempfile.TemporaryDirectory() as images:
            document = parse(SAMPLES / "NTT_Data_Draft_BASEL3_CREATE_REPORT_NSFR.docx", Path(images))
            procedure = next(
                p for p in document["procedures"]
                if p["sp_name_lower"] == "uspi_nsfr_tbls_detail_data_unsecured_deposit"
            )
            for kind in ("data_model", "data_flow"):
                self.assertEqual(procedure[kind]["status"], "available")
                self.assertTrue(procedure[kind]["images"])
                self.assertFalse(procedure[kind]["explanation"])


if __name__ == "__main__":
    unittest.main()
