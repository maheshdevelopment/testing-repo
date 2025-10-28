from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
import io

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Skill(BaseModel):
    name: str
    proficiency_level: str
    years_of_experience: int

class Language(BaseModel):
    name: str
    proficiency_level: str

class ProfileData(BaseModel):
    full_name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    mobile: str
    email: Optional[str] = None
    education: Optional[str] = None
    work_experience: Optional[str] = None
    current_location: Optional[str] = None
    location_preference: Optional[str] = None
    expected_salary_min: Optional[int] = None
    expected_salary_max: Optional[int] = None
    bio: Optional[str] = None
    skills: List[Skill] = []
    languages: List[Language] = []

class ResumeRequest(BaseModel):
    profile: ProfileData

def generate_resume_pdf(profile: ProfileData) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1e3a8a'),
        spaceAfter=30
    )

    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1e3a8a'),
        spaceAfter=12
    )

    story.append(Paragraph(profile.full_name, title_style))

    contact_info = []
    if profile.mobile:
        contact_info.append(f"Mobile: {profile.mobile}")
    if profile.email:
        contact_info.append(f"Email: {profile.email}")
    if profile.current_location:
        contact_info.append(f"Location: {profile.current_location}")

    story.append(Paragraph(" | ".join(contact_info), styles['Normal']))
    story.append(Spacer(1, 0.3 * inch))

    if profile.bio:
        story.append(Paragraph("Professional Summary", heading_style))
        story.append(Paragraph(profile.bio, styles['Normal']))
        story.append(Spacer(1, 0.2 * inch))

    if profile.skills:
        story.append(Paragraph("Skills", heading_style))
        skills_data = [['Skill', 'Proficiency', 'Experience']]
        for skill in profile.skills:
            skills_data.append([
                skill.name,
                skill.proficiency_level.capitalize(),
                f"{skill.years_of_experience} years"
            ])

        skills_table = Table(skills_data, colWidths=[3*inch, 1.5*inch, 1.5*inch])
        skills_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a8a')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(skills_table)
        story.append(Spacer(1, 0.2 * inch))

    if profile.education:
        story.append(Paragraph("Education", heading_style))
        story.append(Paragraph(profile.education, styles['Normal']))
        story.append(Spacer(1, 0.2 * inch))

    if profile.work_experience:
        story.append(Paragraph("Work Experience", heading_style))
        story.append(Paragraph(profile.work_experience, styles['Normal']))
        story.append(Spacer(1, 0.2 * inch))

    if profile.languages:
        story.append(Paragraph("Languages", heading_style))
        lang_text = ", ".join([f"{lang.name} ({lang.proficiency_level})" for lang in profile.languages])
        story.append(Paragraph(lang_text, styles['Normal']))
        story.append(Spacer(1, 0.2 * inch))

    details = []
    if profile.expected_salary_min and profile.expected_salary_max:
        details.append(f"Expected Salary: ₹{profile.expected_salary_min:,} - ₹{profile.expected_salary_max:,}")
    if profile.location_preference:
        details.append(f"Preferred Location: {profile.location_preference}")

    if details:
        story.append(Paragraph("Additional Information", heading_style))
        for detail in details:
            story.append(Paragraph(detail, styles['Normal']))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

@app.post("/generate-resume")
async def generate_resume(request: ResumeRequest):
    try:
        pdf_bytes = generate_resume_pdf(request.profile)

        resume_filename = f"resume_{request.profile.full_name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"

        os.makedirs("/tmp/resumes", exist_ok=True)
        resume_path = f"/tmp/resumes/{resume_filename}"

        with open(resume_path, 'wb') as f:
            f.write(pdf_bytes)

        return {
            "success": True,
            "resume_url": resume_path,
            "filename": resume_filename,
            "message": "Resume generated successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "resume-generator"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
