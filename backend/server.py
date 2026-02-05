import os
import io
import base64
from datetime import datetime, timezone
from typing import Optional, List
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib import colors

load_dotenv()

app = FastAPI(title="Sistema de Demandas - Assessoria de Comunicação")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
demandas_collection = db["demandas"]
solicitantes_collection = db["solicitantes"]
counters_collection = db["counters"]

STATUS_OPTIONS = ["Em aberto", "Confirmado", "Em aprovação", "Finalizado"]


class DeliveryItem(BaseModel):
    type: str  # "file" or "link"
    url: Optional[str] = None
    filename: Optional[str] = None
    file_data: Optional[str] = None  # base64 for files
    mime_type: Optional[str] = None


class DemandaResponse(BaseModel):
    id: str
    numero: str
    solicitante: str
    demanda: str
    referencias: Optional[List[dict]] = None
    status: str
    entregas: Optional[List[dict]] = None
    created_at: str
    month_year: str


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


async def get_next_demanda_number():
    year = datetime.now().year
    counter = await counters_collection.find_one_and_update(
        {"_id": f"demanda_{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    seq = counter["seq"]
    return f"#{year}-{seq:03d}"


def get_month_year_key(date: datetime = None):
    if date is None:
        date = datetime.now()
    return f"{date.month:02d}/{date.year}"


def get_month_year_pt(month_year: str):
    months = {
        '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
        '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
        '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
    }
    try:
        parts = month_year.split('/')
        return f"{months[parts[0]]} de {parts[1]}"
    except:
        return month_year


# ============ SOLICITANTES ============

@app.get("/api/solicitantes")
async def get_solicitantes():
    cursor = solicitantes_collection.find().sort("nome", 1)
    solicitantes = []
    async for doc in cursor:
        solicitantes.append({"id": str(doc["_id"]), "nome": doc["nome"]})
    return solicitantes


@app.post("/api/solicitantes")
async def add_solicitante(nome: str = Form(...)):
    existing = await solicitantes_collection.find_one({"nome": {"$regex": f"^{nome}$", "$options": "i"}})
    if existing:
        return {"id": str(existing["_id"]), "nome": existing["nome"]}
    
    result = await solicitantes_collection.insert_one({"nome": nome})
    return {"id": str(result.inserted_id), "nome": nome}


# ============ DEMANDAS ============

@app.post("/api/demandas", response_model=DemandaResponse)
async def create_demanda(
    solicitante: str = Form(...),
    demanda: str = Form(...),
    referencia_links: Optional[str] = Form(None),
    referencia_files: List[UploadFile] = File(default=[])
):
    # Ensure solicitante exists
    existing = await solicitantes_collection.find_one({"nome": {"$regex": f"^{solicitante}$", "$options": "i"}})
    if not existing:
        await solicitantes_collection.insert_one({"nome": solicitante})
    
    numero = await get_next_demanda_number()
    now = datetime.now(timezone.utc)
    month_year = get_month_year_key(now)
    
    referencias = []
    
    # Process links
    if referencia_links:
        for link in referencia_links.split(","):
            link = link.strip()
            if link:
                referencias.append({"type": "link", "url": link})
    
    # Process files
    for file in referencia_files:
        if file.filename:
            contents = await file.read()
            referencias.append({
                "type": "file",
                "filename": file.filename,
                "mime_type": file.content_type,
                "file_data": base64.b64encode(contents).decode("utf-8")
            })
    
    demanda_doc = {
        "numero": numero,
        "solicitante": solicitante,
        "demanda": demanda,
        "referencias": referencias if referencias else None,
        "status": "Em aberto",
        "entregas": None,
        "created_at": now.isoformat(),
        "month_year": month_year
    }
    
    result = await demandas_collection.insert_one(demanda_doc)
    
    return DemandaResponse(
        id=str(result.inserted_id),
        numero=numero,
        solicitante=solicitante,
        demanda=demanda,
        referencias=referencias if referencias else None,
        status="Em aberto",
        entregas=None,
        created_at=demanda_doc["created_at"],
        month_year=month_year
    )


@app.get("/api/demandas")
async def get_demandas(
    month: Optional[str] = None,
    year: Optional[str] = None,
    status: Optional[str] = None,
    solicitante: Optional[str] = None,
    search: Optional[str] = None
):
    query = {}
    conditions = []
    
    if month and year:
        month_year = f"{month.zfill(2)}/{year}"
        conditions.append({"month_year": month_year})
    
    if status:
        conditions.append({"status": status})
    
    if solicitante:
        conditions.append({"solicitante": {"$regex": solicitante, "$options": "i"}})
    
    if search:
        conditions.append({
            "$or": [
                {"numero": {"$regex": search, "$options": "i"}},
                {"demanda": {"$regex": search, "$options": "i"}},
                {"solicitante": {"$regex": search, "$options": "i"}}
            ]
        })
    
    if conditions:
        query = {"$and": conditions} if len(conditions) > 1 else conditions[0]
    
    cursor = demandas_collection.find(query).sort("created_at", -1)
    demandas = []
    
    async for doc in cursor:
        demandas.append({
            "id": str(doc["_id"]),
            "numero": doc["numero"],
            "solicitante": doc["solicitante"],
            "demanda": doc["demanda"],
            "referencias": doc.get("referencias"),
            "status": doc["status"],
            "entregas": doc.get("entregas"),
            "created_at": doc["created_at"],
            "month_year": doc["month_year"]
        })
    
    return demandas


@app.get("/api/demandas/{demanda_id}")
async def get_demanda(demanda_id: str):
    try:
        doc = await demandas_collection.find_one({"_id": ObjectId(demanda_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    if not doc:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")
    
    return {
        "id": str(doc["_id"]),
        "numero": doc["numero"],
        "solicitante": doc["solicitante"],
        "demanda": doc["demanda"],
        "referencias": doc.get("referencias"),
        "status": doc["status"],
        "entregas": doc.get("entregas"),
        "created_at": doc["created_at"],
        "month_year": doc["month_year"]
    }


@app.put("/api/demandas/{demanda_id}/status")
async def update_status(demanda_id: str, status: str = Form(...)):
    if status not in STATUS_OPTIONS:
        raise HTTPException(status_code=400, detail=f"Status inválido. Use: {STATUS_OPTIONS}")
    
    try:
        result = await demandas_collection.update_one(
            {"_id": ObjectId(demanda_id)},
            {"$set": {"status": status}}
        )
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")
    
    return {"message": "Status atualizado", "status": status}


@app.post("/api/demandas/{demanda_id}/entregas")
async def add_entrega(
    demanda_id: str,
    entrega_links: Optional[str] = Form(None),
    entrega_files: List[UploadFile] = File(default=[])
):
    try:
        doc = await demandas_collection.find_one({"_id": ObjectId(demanda_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    if not doc:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")
    
    entregas = doc.get("entregas") or []
    
    # Process links
    if entrega_links:
        for link in entrega_links.split(","):
            link = link.strip()
            if link:
                entregas.append({"type": "link", "url": link, "added_at": datetime.now(timezone.utc).isoformat()})
    
    # Process files
    for file in entrega_files:
        if file.filename:
            contents = await file.read()
            entregas.append({
                "type": "file",
                "filename": file.filename,
                "mime_type": file.content_type,
                "file_data": base64.b64encode(contents).decode("utf-8"),
                "added_at": datetime.now(timezone.utc).isoformat()
            })
    
    await demandas_collection.update_one(
        {"_id": ObjectId(demanda_id)},
        {"$set": {"entregas": entregas}}
    )
    
    return {"message": "Entregas adicionadas", "total": len(entregas)}


@app.delete("/api/demandas/{demanda_id}/entregas/{entrega_index}")
async def remove_entrega(demanda_id: str, entrega_index: int):
    try:
        doc = await demandas_collection.find_one({"_id": ObjectId(demanda_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    if not doc:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")
    
    entregas = doc.get("entregas") or []
    if entrega_index < 0 or entrega_index >= len(entregas):
        raise HTTPException(status_code=400, detail="Índice de entrega inválido")
    
    entregas.pop(entrega_index)
    
    await demandas_collection.update_one(
        {"_id": ObjectId(demanda_id)},
        {"$set": {"entregas": entregas if entregas else None}}
    )
    
    return {"message": "Entrega removida"}


@app.delete("/api/demandas/{demanda_id}")
async def delete_demanda(demanda_id: str):
    try:
        result = await demandas_collection.delete_one({"_id": ObjectId(demanda_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")
    
    return {"message": "Demanda excluída"}


@app.put("/api/demandas/{demanda_id}")
async def update_demanda(
    demanda_id: str,
    solicitante: Optional[str] = Form(None),
    demanda: Optional[str] = Form(None),
    status: Optional[str] = Form(None)
):
    try:
        existing = await demandas_collection.find_one({"_id": ObjectId(demanda_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    if not existing:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")
    
    update_data = {}
    if solicitante:
        update_data["solicitante"] = solicitante
    if demanda:
        update_data["demanda"] = demanda
    if status and status in STATUS_OPTIONS:
        update_data["status"] = status
    
    if update_data:
        await demandas_collection.update_one(
            {"_id": ObjectId(demanda_id)},
            {"$set": update_data}
        )
    
    return {"message": "Demanda atualizada"}


# ============ WHATSAPP TEXT ============

@app.get("/api/demandas/{demanda_id}/whatsapp")
async def get_whatsapp_text(demanda_id: str):
    try:
        doc = await demandas_collection.find_one({"_id": ObjectId(demanda_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    if not doc:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")
    
    text_lines = [
        f"*Demanda {doc['numero']}*",
        f"Solicitante: {doc['solicitante']}",
        f"Descrição: {doc['demanda']}",
        f"Status: {doc['status']}"
    ]
    
    entregas = doc.get("entregas") or []
    if entregas:
        entrega_items = []
        for e in entregas:
            if e["type"] == "link":
                entrega_items.append(e["url"])
            else:
                entrega_items.append(f"[Arquivo: {e['filename']}]")
        text_lines.append(f"Entrega: {', '.join(entrega_items)}")
    
    return {"text": "\n".join(text_lines)}


# ============ MONTHLY PDF REPORT ============

@app.get("/api/relatorio/{month}/{year}/pdf")
async def generate_monthly_pdf(month: str, year: str):
    month_year = f"{month.zfill(2)}/{year}"
    
    cursor = demandas_collection.find({"month_year": month_year}).sort("created_at", 1)
    demandas = []
    async for doc in cursor:
        demandas.append(doc)
    
    if not demandas:
        raise HTTPException(status_code=404, detail="Nenhuma demanda encontrada para este mês")
    
    buffer = io.BytesIO()
    
    pdf_doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        alignment=TA_CENTER,
        spaceAfter=6,
        fontName='Times-Bold'
    )
    
    header_style = ParagraphStyle(
        'Header',
        parent=styles['Normal'],
        fontSize=11,
        alignment=TA_CENTER,
        spaceAfter=3,
        fontName='Times-Roman'
    )
    
    section_title_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontSize=12,
        alignment=TA_LEFT,
        spaceBefore=15,
        spaceAfter=6,
        fontName='Times-Bold'
    )
    
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontSize=10,
        alignment=TA_LEFT,
        spaceAfter=8,
        fontName='Times-Roman',
        leading=14
    )
    
    small_style = ParagraphStyle(
        'Small',
        parent=styles['Normal'],
        fontSize=9,
        alignment=TA_LEFT,
        spaceAfter=4,
        fontName='Times-Roman',
        textColor=colors.gray
    )
    
    elements = []
    
    # Header
    month_year_pt = get_month_year_pt(month_year)
    elements.append(Paragraph(f"Relatório de Produção", title_style))
    elements.append(Paragraph(f"{month_year_pt}", title_style))
    elements.append(Spacer(1, 12))
    elements.append(Paragraph("Nome: Gustavo Ferreira Santos", header_style))
    elements.append(Paragraph("Cargo: Assessor Especial 3", header_style))
    elements.append(Paragraph("Secretária: Sheila Cristina", header_style))
    elements.append(Paragraph("Prefeitura Municipal de Canaã dos Carajás", header_style))
    elements.append(Spacer(1, 20))
    
    # Summary
    total = len(demandas)
    finalizadas = sum(1 for d in demandas if d["status"] == "Finalizado")
    elements.append(Paragraph(f"Total de demandas: {total} | Finalizadas: {finalizadas}", body_style))
    elements.append(Spacer(1, 20))
    
    # Each demanda
    for i, doc in enumerate(demandas, 1):
        elements.append(Paragraph(f"─────────────────────────────────────────", body_style))
        elements.append(Paragraph(f"<b>{doc['numero']}</b> — {doc['solicitante']}", section_title_style))
        elements.append(Paragraph(f"Status: {doc['status']}", small_style))
        elements.append(Spacer(1, 4))
        elements.append(Paragraph(f"<b>Demanda:</b> {doc['demanda']}", body_style))
        
        # Referencias
        referencias = doc.get("referencias") or []
        if referencias:
            ref_text = []
            for ref in referencias:
                if ref["type"] == "link":
                    ref_text.append(f"Link: {ref['url']}")
                else:
                    ref_text.append(f"Arquivo: {ref['filename']}")
            elements.append(Paragraph(f"<b>Referências:</b> {'; '.join(ref_text)}", small_style))
        
        # Entregas with images
        entregas = doc.get("entregas") or []
        if entregas:
            elements.append(Paragraph("<b>Entregas:</b>", body_style))
            for entrega in entregas:
                if entrega["type"] == "link":
                    elements.append(Paragraph(f"• Link: {entrega['url']}", small_style))
                else:
                    elements.append(Paragraph(f"• Arquivo: {entrega['filename']}", small_style))
                    # If it's an image, try to display it
                    mime = entrega.get("mime_type", "")
                    if mime.startswith("image/") and entrega.get("file_data"):
                        try:
                            img_data = base64.b64decode(entrega["file_data"])
                            img_buffer = io.BytesIO(img_data)
                            
                            from PIL import Image as PILImage
                            pil_img = PILImage.open(img_buffer)
                            img_width, img_height = pil_img.size
                            
                            max_width = 12*cm
                            max_height = 8*cm
                            
                            ratio = min(max_width/img_width, max_height/img_height)
                            new_width = img_width * ratio
                            new_height = img_height * ratio
                            
                            img_buffer.seek(0)
                            img = Image(img_buffer, width=new_width, height=new_height)
                            elements.append(Spacer(1, 6))
                            elements.append(img)
                        except Exception:
                            pass
        
        elements.append(Spacer(1, 10))
    
    pdf_doc.build(elements)
    buffer.seek(0)
    
    filename = f"relatorio_{month_year.replace('/', '-')}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.get("/api/months")
async def get_available_months():
    """Get list of months that have demandas"""
    pipeline = [
        {"$group": {"_id": "$month_year"}},
        {"$sort": {"_id": -1}}
    ]
    cursor = demandas_collection.aggregate(pipeline)
    months = []
    async for doc in cursor:
        if doc["_id"]:
            months.append(doc["_id"])
    return months


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
