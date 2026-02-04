import os
import io
import base64
from datetime import datetime, timezone
from typing import Optional, List
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT

load_dotenv()

app = FastAPI(title="Sistema de Relatórios de Produção")

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
reports_collection = db["reports"]


class ReportBase(BaseModel):
    demanda: str
    solicitante: Optional[str] = None  # Quem pediu
    secretaria: Optional[str] = None   # Para onde foi feito
    data: str
    image_data: Optional[str] = None


class ReportResponse(BaseModel):
    id: str
    demanda: str
    solicitante: Optional[str] = None
    secretaria: Optional[str] = None
    data: str
    has_image: bool
    created_at: str


class ReportUpdate(BaseModel):
    demanda: Optional[str] = None
    solicitante: Optional[str] = None
    secretaria: Optional[str] = None
    data: Optional[str] = None
    image_data: Optional[str] = None
    remove_image: Optional[bool] = False


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/api/reports", response_model=ReportResponse)
async def create_report(
    demanda: str = Form(...),
    data: str = Form(...),
    solicitante: Optional[str] = Form(None),
    secretaria: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None)
):
    image_data = None
    if image:
        contents = await image.read()
        image_data = base64.b64encode(contents).decode("utf-8")
    
    report_doc = {
        "demanda": demanda,
        "solicitante": solicitante or None,
        "secretaria": secretaria or None,
        "data": data,
        "image_data": image_data,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await reports_collection.insert_one(report_doc)
    
    return ReportResponse(
        id=str(result.inserted_id),
        demanda=demanda,
        solicitante=solicitante,
        secretaria=secretaria,
        data=data,
        has_image=image_data is not None,
        created_at=report_doc["created_at"]
    )


@app.get("/api/reports", response_model=List[ReportResponse])
async def get_reports(search: Optional[str] = None, month: Optional[str] = None, year: Optional[str] = None):
    query = {}
    conditions = []
    
    if search:
        conditions.append({
            "$or": [
                {"solicitante": {"$regex": search, "$options": "i"}},
                {"secretaria": {"$regex": search, "$options": "i"}},
                {"data": {"$regex": search, "$options": "i"}},
                {"demanda": {"$regex": search, "$options": "i"}}
            ]
        })
    
    # Filter by month/year (format: DD/MM/YYYY)
    if month and year:
        date_pattern = f"/{month.zfill(2)}/{year}"
        conditions.append({"data": {"$regex": date_pattern}})
    
    if conditions:
        query = {"$and": conditions} if len(conditions) > 1 else conditions[0]
    
    cursor = reports_collection.find(query).sort("created_at", -1)
    reports = []
    
    async for doc in cursor:
        reports.append(ReportResponse(
            id=str(doc["_id"]),
            demanda=doc["demanda"],
            solicitante=doc.get("solicitante"),
            secretaria=doc.get("secretaria"),
            data=doc["data"],
            has_image=doc.get("image_data") is not None,
            created_at=doc.get("created_at", "")
        ))
    
    return reports


@app.get("/api/reports/{report_id}")
async def get_report(report_id: str):
    try:
        doc = await reports_collection.find_one({"_id": ObjectId(report_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    if not doc:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    return {
        "id": str(doc["_id"]),
        "demanda": doc["demanda"],
        "solicitante": doc.get("solicitante"),
        "secretaria": doc.get("secretaria"),
        "data": doc["data"],
        "image_data": doc.get("image_data"),
        "has_image": doc.get("image_data") is not None,
        "created_at": doc.get("created_at", "")
    }


@app.put("/api/reports/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: str,
    demanda: Optional[str] = Form(None),
    solicitante: Optional[str] = Form(None),
    secretaria: Optional[str] = Form(None),
    data: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    remove_image: Optional[str] = Form(None)
):
    try:
        existing = await reports_collection.find_one({"_id": ObjectId(report_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    if not existing:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    update_data = {}
    if demanda is not None:
        update_data["demanda"] = demanda
    if solicitante is not None:
        update_data["solicitante"] = solicitante if solicitante else None
    if secretaria is not None:
        update_data["secretaria"] = secretaria if secretaria else None
    if data is not None:
        update_data["data"] = data
    
    if remove_image == "true":
        update_data["image_data"] = None
    elif image:
        contents = await image.read()
        update_data["image_data"] = base64.b64encode(contents).decode("utf-8")
    
    if update_data:
        await reports_collection.update_one(
            {"_id": ObjectId(report_id)},
            {"$set": update_data}
        )
    
    updated = await reports_collection.find_one({"_id": ObjectId(report_id)})
    
    return ReportResponse(
        id=str(updated["_id"]),
        demanda=updated["demanda"],
        solicitante=updated.get("solicitante"),
        secretaria=updated.get("secretaria"),
        data=updated["data"],
        has_image=updated.get("image_data") is not None,
        created_at=updated.get("created_at", "")
    )


@app.delete("/api/reports/{report_id}")
async def delete_report(report_id: str):
    try:
        result = await reports_collection.delete_one({"_id": ObjectId(report_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    return {"message": "Relatório excluído com sucesso"}


def get_month_year_pt(date_str: str) -> str:
    months = {
        1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
        5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
        9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"
    }
    try:
        parts = date_str.split("/")
        month = int(parts[1])
        year = parts[2]
        return f"{months[month]} / {year}"
    except Exception:
        return date_str


@app.get("/api/reports/{report_id}/pdf")
async def generate_pdf(report_id: str):
    try:
        doc = await reports_collection.find_one({"_id": ObjectId(report_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    if not doc:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    buffer = io.BytesIO()
    
    pdf_doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2.5*cm,
        leftMargin=2.5*cm,
        topMargin=2.5*cm,
        bottomMargin=2.5*cm
    )
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
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
        spaceBefore=20,
        spaceAfter=8,
        fontName='Times-Bold'
    )
    
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontSize=11,
        alignment=TA_LEFT,
        spaceAfter=12,
        fontName='Times-Roman',
        leading=16
    )
    
    elements = []
    
    month_year = get_month_year_pt(doc["data"])
    elements.append(Paragraph(f"Relatório de Produção de: {month_year}", title_style))
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(f"Data: {doc['data']}", header_style))
    elements.append(Spacer(1, 12))
    elements.append(Paragraph("Nome: Gustavo Ferreira Santos", header_style))
    elements.append(Paragraph("Cargo: Assessor Especial 3", header_style))
    elements.append(Paragraph("Secretária: Sheila Cristina", header_style))
    elements.append(Paragraph("Prefeitura Municipal de Canaã dos Carajás", header_style))
    
    elements.append(Spacer(1, 30))
    
    elements.append(Paragraph("DEMANDA", section_title_style))
    elements.append(Paragraph(doc["demanda"], body_style))
    
    elements.append(Paragraph("SOLICITAÇÃO", section_title_style))
    elements.append(Paragraph(doc["solicitacao"], body_style))
    
    if doc.get("image_data"):
        elements.append(Spacer(1, 20))
        elements.append(Paragraph("ANEXO (PRINTSCREEN)", section_title_style))
        
        try:
            img_data = base64.b64decode(doc["image_data"])
            img_buffer = io.BytesIO(img_data)
            
            from PIL import Image as PILImage
            pil_img = PILImage.open(img_buffer)
            img_width, img_height = pil_img.size
            
            max_width = 15*cm
            max_height = 12*cm
            
            ratio = min(max_width/img_width, max_height/img_height)
            new_width = img_width * ratio
            new_height = img_height * ratio
            
            img_buffer.seek(0)
            img = Image(img_buffer, width=new_width, height=new_height)
            elements.append(img)
        except Exception as e:
            elements.append(Paragraph(f"[Erro ao carregar imagem]", body_style))
    
    pdf_doc.build(elements)
    buffer.seek(0)
    
    filename = f"relatorio_{doc['data'].replace('/', '-')}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
