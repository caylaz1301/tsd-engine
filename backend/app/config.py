"""
config.py -- pola & alias hasil audit M1 atas 3 dokumen TSD NTT.

Semua aturan parsing dikumpulkan di sini supaya kalau format dokumen berubah,
yang diubah hanya file ini -- bukan parser.
"""

import re

# Word memakai en-dash dan hyphen secara tidak konsisten sebagai pemisah.
DASH_CLASS = "\\-\u2013\u2014"

# Style heading yang dipakai dokumen TSD NTT (hasil audit M1).
HEADING_STYLE_LEVEL = {
    "DocumentTitle": 0,
    "Title": 0,
    "Heading1": 1,
    "Heading2": 2,
    "Heading3": 3,
    "Heading4": 4,
    "Heading5": 5,
    "Heading6": 6,
}

# Contoh heading yang cocok:
#   "2.1.2.1. Data Models - LLL-DM_LLL_COLLATERAL - sp_update_collateral_daily"
#   "2.1.2.6.b. Data Flow - LBBU-PKLBBUGL_NEW_GRP_BU09B - USP_GRP_TBLT_BU9B3"
#   "2.1.1 Data Models - LLL-DM_LLL_COLLATERAL - Summary Fasilitas"
DIAGRAM_HEADING_RE = re.compile(
    r"^\s*(?P<num>\d+(?:\.[0-9A-Za-z]+)*\.?)\s*"
    r"(?P<kind>Data\s*Models?|Data\s*Flow)\s*"
    r"(?P<rest>.*)$",
    re.IGNORECASE,
)

KIND_MAP = {
    "data model": "data_model",
    "data models": "data_model",
    "data flow": "data_flow",
}

# Heading level segment (bukan SP tertentu).
SEGMENT_SUMMARY_RE = re.compile(r"summary\s+fasilitas", re.IGNORECASE)

# Nama SP: identifier SQL. Tidak pernah mengandung tanda hubung atau spasi.
SP_TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")

# Token yang jelas bukan nama SP.
SP_NAME_BLACKLIST = {
    "summary",
    "fasilitas",
    "ringkasan",
}

# Prefix yang wajar untuk stored procedure di lingkungan NTT/REGLA.
SP_PREFIX_HINTS = ("sp_", "usp", "ups", "prc_", "proc_", "ubah")

# Section table specification di Appendix.
SPEC_SECTION_ALIASES = {
    "source": ["table source"],
    "parameter": ["table parameter"],
    "target": ["table target"],
}

SPEC_TABLE_HEADER = ["field name", "data type", "description"]
SPEC_TABLE_LABEL_RE = re.compile(
    r"list\s+of\s+table\s+specification\s+(?P<name>[#A-Za-z_][A-Za-z0-9_.$#]*)\s*:?",
    re.IGNORECASE,
)
CHANGE_CONTROL_HEADER_HINT = ["version", "date", "authors"]

# Gambar lebih kecil dari ini dianggap logo/ikon, bukan diagram.
MIN_DIAGRAM_WIDTH_IN = 1.5

# Section boilerplate yang tidak pernah berisi diagram SP.
IGNORE_SECTIONS = (
    "table of contents",
    "system architecture",
    "components",
    "technology stack",
    "list of procedures",
    "ntt data",
    "technical specification document",
)

# Segment diambil dari nama file, bukan dari isi dokumen.
#   NTT_Data_Draft_LLL-DM_LLL_COLLATERAL.docx      -> LLL-DM_LLL_COLLATERAL
#   NTT_Data_Draft_TSD_LBBU-PK_LBBUGL_NEW_GRP_BU09B -> LBBU-PK_LBBUGL_NEW_GRP_BU09B
FILENAME_SEGMENT_RE = re.compile(
    r"^NTT[_\s]*Data[_\s]*Draft[_\s]*(?:TSD[_\s]*)?(?P<segment>.+)$",
    re.IGNORECASE,
)

# Paragraf penjelasan diagram biasanya dimulai dengan penanda ini.
EXPLANATION_HINT_RE = re.compile(
    r"penjelasan|explanation|alur\s+data|flowchart|logika\s+proses",
    re.IGNORECASE,
)
