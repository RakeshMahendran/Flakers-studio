
# Helper: Convert manual text files to PDF
# Usage: python manual_to_pdf.py

import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

def create_pdf_from_text_files(folder='manual_content'):
    """Create PDF from text files in a folder"""
    if not os.path.exists(folder):
        os.makedirs(folder)
        print(f"Created folder: {folder}")
        print("Add .txt files with scraped content to this folder")
        return
    
    txt_files = [f for f in os.listdir(folder) if f.endswith('.txt')]
    if not txt_files:
        print(f"No .txt files found in {folder}/")
        return
    
    doc = SimpleDocTemplate('manual_supplyguard_content.pdf', pagesize=letter)
    story = []
    styles = getSampleStyleSheet()
    
    for txt_file in txt_files:
        with open(os.path.join(folder, txt_file), 'r', encoding='utf-8') as f:
            content = f.read()
        
        story.append(Paragraph(f"<b>{txt_file}</b>", styles['Heading1']))
        for para in content.split('\n\n'):
            if para.strip():
                story.append(Paragraph(para.strip(), styles['BodyText']))
        story.append(PageBreak())
    
    doc.build(story)
    print(f"✅ PDF created: manual_supplyguard_content.pdf")

if __name__ == "__main__":
    create_pdf_from_text_files()
