from datetime import date, timedelta
from calendar import monthrange
from typing import Literal
from dotenv import load_dotenv
from pydantic import BaseModel, Field, SecretStr
from langchain_openai import ChatOpenAI
from markitdown import MarkItDown
from openai import OpenAI
import pandas as pd
import os
import re

load_dotenv()

DOSSIER_FACTURES = "factures"
OUTPUT_XLSX = "output/factures_et_bl.xlsx"

class DocumentInfo(BaseModel):
    type_document: Literal["facture", "bon_livraison"] | None = None
    numero_facture: str | None = None
    numero_bon_livraison: str | None = None
    date_emission: date | None = None
    date_livraison: date | None = None
    date_paiement_prevue: date | None = None
    montant_total: float | None = None
    nom_fournisseur: Literal["SYSCO", "AMBELYS", "TERREAZUR"] | None = None
    bons_livraisons: list[str] = Field(default_factory=list)
    prix_HT_5_5pct: float | None = None
    prix_HT_10pct: float | None = None
    prix_HT_20pct: float | None = None

def build_apim_headers(feature: str, api_key: str | None = None) -> dict[str, str]:
    return {"api-key": api_key or "", "owner": "HAMILTON", "feature": feature}

APIM_OPENAI_BASE_URL = os.getenv("APIM_OPENAI_BASE_URL")
APIM_OPENAI_API_KEY = os.getenv("APIM_OPENAI_API_KEY")
api_key = APIM_OPENAI_API_KEY
feature = "my-feature"

llm = ChatOpenAI(
    model="gpt-5.1-2025-11-13",
    api_key=SecretStr(api_key),
    base_url=APIM_OPENAI_BASE_URL,
    default_headers=build_apim_headers(feature=feature, api_key=api_key),
    use_responses_api=False,
    streaming=False,
    reasoning_effort="low",
    temperature=0,
    max_retries=3,
    max_completion_tokens=1024,
    verbose=True,
).with_structured_output(
    DocumentInfo,
    method="json_schema",
    strict=False,
    include_raw=False,
)

llm_client = OpenAI(
    api_key=api_key,
    base_url=APIM_OPENAI_BASE_URL,
    default_headers=build_apim_headers(feature=feature, api_key=api_key),
)

md = MarkItDown(enable_plugins=True, llm_client=llm_client, llm_model="gpt-5.1-2025-11-13")

print("Initialisation terminée. Prêt à traiter les documents.")

def load_pdf_text(filepath: str) -> str:
    return md.convert(filepath).text_content

def extract_date_candidates(text: str) -> list[date]:
    out, seen = [], set()
    for d, m, y in re.findall(r"\b(\d{2})[/-](\d{2})[/-](\d{4})\b", text):
        try:
            dt = date(int(y), int(m), int(d))
            if 2020 <= dt.year <= 2100 and dt not in seen:
                seen.add(dt)
                out.append(dt)
        except ValueError:
            pass
    for y, m, d in re.findall(r"\b(\d{4})-(\d{2})-(\d{2})\b", text):
        try:
            dt = date(int(y), int(m), int(d))
            if 2020 <= dt.year <= 2100 and dt not in seen:
                seen.add(dt)
                out.append(dt)
        except ValueError:
            pass
    return sorted(out)

def extract_date_from_filename(filename: str) -> date | None:
    m = re.search(r"(20\d{2})(\d{2})(\d{2})", filename)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None

def infer_due_date(emission: date | None, text: str) -> date | None:
    if not emission:
        return None
    lower = text.lower()
    m = re.search(r"(\d{1,3})\s*jours?", lower)
    delay = int(m.group(1)) if m else None
    if delay is None:
        return None
    if "fin de mois" in lower:
        eom = date(emission.year, emission.month, monthrange(emission.year, emission.month)[1])
        return eom + timedelta(days=delay)
    return emission + timedelta(days=delay)

def clean_bl_number(value: str) -> str:
    v = str(value).upper().strip()
    v = re.sub(r"^BL\s*N[°O]?\s*", "", v)
    v = re.sub(r"^BON\s+DE\s+LIVRAISON\s*N[°O]?\s*", "", v)
    v = re.sub(r"^AR\s*CDE\s*N[°O]?\s*", "", v)
    v = re.sub(r"\s+", "", v)
    return v

def normalize_bl_list(values: list[str]) -> list[str]:
    cleaned, seen = [], set()
    for v in values or []:
        c = clean_bl_number(v)
        if c and c not in seen:
            seen.add(c)
            cleaned.append(c)
    return cleaned

def normalize_supplier_name(value: str | None) -> str | None:
    if not value:
        return None
    raw = re.sub(r"\s+", " ", value.upper().strip())
    if "AMBELYS" in raw:
        return "AMBELYS"
    if "SYSCO" in raw:
        return "SYSCO"
    if "TERREAZUR" in raw or "TERRE AZUR" in raw:
        return "TERREAZUR"
    return None

def classify_document(text: str, filename: str) -> str:
    lower = text.lower()
    head = lower[:8000]
    f = filename.lower()

    # Règle prioritaire : si le mot "facture" est présent dans le texte ou le nom de fichier, c'est une facture
    if "facture" in head or "facture" in f:
        return "facture"

    invoice_score = 0
    delivery_score = 0

    if re.search(r"\bar\s*cde\s*n[°o]?\s*\d+", head):
        delivery_score += 10
    if "a livrer le" in head or "à livrer le" in head:
        delivery_score += 8
    for marker in ["bon de livraison", "bon livraison", "bl n", "bl n°"]:
        if marker in head:
            delivery_score += 4

    if re.search(r"\bttc\b|\btva\b|\béchéance\b|\bdate de facture\b", head):
        invoice_score += 2

    if "bl" in f or "livraison" in f or "cde" in f:
        delivery_score += 2

    return "bon_livraison" if delivery_score >= invoice_score else "facture"

def normalize_invoice_dates(data: dict, text: str, filename: str) -> dict:
    candidates = extract_date_candidates(text)
    file_date = extract_date_from_filename(filename)

    emission = data.get("date_emission")
    if not isinstance(emission, date):
        emission = file_date or (candidates[0] if candidates else None)
    data["date_emission"] = emission

    due = data.get("date_paiement_prevue")
    if not isinstance(due, date):
        due = infer_due_date(emission, text)
        if due is None:
            later = [d for d in candidates if emission and d >= emission]
            due = later[-1] if later else None
    data["date_paiement_prevue"] = due
    return data

def finalize_document_data(data: dict, text: str, filename: str, predicted_type: str) -> dict:
    data = dict(data)
    data["type_document"] = predicted_type
    data["fichier_source"] = filename

    data["nom_fournisseur"] = normalize_supplier_name(data.get("nom_fournisseur"))

    if predicted_type == "facture":
        data = normalize_invoice_dates(data, text=text, filename=filename)

    if predicted_type == "bon_livraison":
        if not data.get("numero_bon_livraison"):
            patterns = [
                r"\bar\s*cde\s*[n°o:\- ]+\s*([A-Z0-9\-\/]+)",
                r"\bbon de livraison\s*[n°o:\- ]+\s*([A-Z0-9\-\/]+)",
                r"\bbl\s*[n°o:\- ]+\s*([A-Z0-9\-\/]+)",
            ]
            for p in patterns:
                m = re.search(p, text, re.IGNORECASE)
                if m:
                    data["numero_bon_livraison"] = clean_bl_number(m.group(1))
                    break

        if not data.get("date_livraison"):
            candidates = extract_date_candidates(text)
            for d in candidates:
                if d.year >= 2020:
                    data["date_livraison"] = d
                    break

        data["bons_livraisons"] = normalize_bl_list(data.get("bons_livraisons", []))

    if isinstance(data.get("bons_livraisons"), list):
        data["bons_livraisons"] = normalize_bl_list(data["bons_livraisons"])

    if data.get("numero_bon_livraison"):
        data["numero_bon_livraison"] = clean_bl_number(data["numero_bon_livraison"])

    return data

def build_prompt(document_type: str, text: str) -> str:
    if document_type == "bon_livraison":
        return f"""
Extrais uniquement les informations du bon de livraison.
Retourne un JSON conforme au schéma.

Règles:
- type_document = bon_livraison
- Si une valeur est absente, retourne null
- numero_bon_livraison = numéro principal du BL
- date_livraison entre 2020 et 2100 sinon null
- normalise les montants en nombres
- nom_fournisseur doit être exactement une des valeurs suivantes : SYSCO, AMBELYS, TERREAZUR

Texte:
{text}
"""
    return f"""
Extrais uniquement les informations de facture.
Retourne un JSON conforme au schéma.

Règles:
- type_document = facture
- Si une valeur est absente, retourne null
- date_emission et date_paiement_prevue entre 2020 et 2100 sinon null
- si la date de paiement n'est pas explicitement présente, utilise les conditions de paiement
- si des bons de livraison sont présents, renseigne bons_livraisons
- normalise les montants en nombres
- nom_fournisseur doit être exactement une des valeurs suivantes : SYSCO, AMBELYS, TERREAZUR

Texte:
{text}
"""

def link_documents(factures: list[dict], bons: list[dict]) -> tuple[list[dict], list[dict]]:
    bl_to_facture = {}
    for f in factures:
        for bl_num in f.get("bons_livraisons", []):
            bl_to_facture[str(bl_num).strip()] = f.get("numero_facture")

    for bon in bons:
        bon_num = bon.get("numero_bon_livraison")
        if bon_num:
            bon["numero_facture_rattachee"] = bl_to_facture.get(str(bon_num).strip())

    return factures, bons

def fetch_files_from_api():
    os.makedirs(DOSSIER_FACTURES, exist_ok=True)

def clean_date_columns(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    df = df.copy()
    for col in ["date_emission", "date_livraison", "date_paiement_prevue"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.date
            df[col] = df[col].where(df[col].notna(), None)
    return df

def process_all_documents():
    os.makedirs(DOSSIER_FACTURES, exist_ok=True)
    os.makedirs("output", exist_ok=True)

    factures, bons = [], []

    for file in os.listdir(DOSSIER_FACTURES):
        if not file.lower().endswith(".pdf"):
            continue

        path = os.path.join(DOSSIER_FACTURES, file)
        text = load_pdf_text(path)
        doc_type = classify_document(text, file)
        prompt = build_prompt(doc_type, text)

        result = llm.invoke(prompt)
        data = result.model_dump() if hasattr(result, "model_dump") else dict(result)
        data = finalize_document_data(data, text=text, filename=file, predicted_type=doc_type)

        if doc_type == "bon_livraison":
            bons.append(data)
        else:
            factures.append(data)

    factures, bons = link_documents(factures, bons)

    df_factures = clean_date_columns(pd.DataFrame(factures))
    df_bons = clean_date_columns(pd.DataFrame(bons))

    with pd.ExcelWriter(OUTPUT_XLSX, engine="openpyxl") as writer:
        if not df_factures.empty:
            df_factures.sort_values(by=["nom_fournisseur", "date_emission"], na_position="last").to_excel(
                writer, sheet_name="Factures", index=False
            )
        if not df_bons.empty:
            df_bons.sort_values(by=["nom_fournisseur", "date_livraison"], na_position="last").to_excel(
                writer, sheet_name="BonsLivraison", index=False
            )

    print(f"✅ {len(factures)} factures et {len(bons)} bons de livraison traités.")
    print(f"📊 Excel généré : {OUTPUT_XLSX}")
    return df_factures, df_bons

if __name__ == "__main__":
    print("Démarrage du traitement des documents...")
    fetch_files_from_api()
    factures_df, bons_df = process_all_documents()
    print(f"Traitement terminé. {len(factures_df)} factures et {len(bons_df)} bons de livraison extraits.")