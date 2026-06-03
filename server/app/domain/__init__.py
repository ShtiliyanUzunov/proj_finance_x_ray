"""Bank-agnostic transaction model and per-source mappers.

Everything in this package speaks the internal `Transaction` shape — no raw CSV
columns, no per-bank naming. Mappers in `domain.mappers` translate a specific
source format (DSK CSV today; potentially other banks tomorrow) into that
shape, so the rest of the app can be written against one consistent vocabulary.
"""
