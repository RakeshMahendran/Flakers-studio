"""Direct import test to verify _detect_language is accessible"""
import sys
sys.path.insert(0, 'E:/FlakersStudio')

print("Step 1: Importing ContentProcessor...")
from backend.ingestion.content_processor import ContentProcessor

print("Step 2: Creating instance...")
processor = ContentProcessor()

print(f"Step 3: Check if method exists: {hasattr(processor, '_detect_language')}")

print("Step 4: Get all methods with 'detect' in name:")
methods = [m for m in dir(processor) if 'detect' in m.lower()]
print(f"  Found: {methods}")

print("Step 5: Try calling the method...")
try:
    result = processor._detect_language("Hello world")
    print(f"  SUCCESS! Result: {result}")
except AttributeError as e:
    print(f"  FAILED! Error: {e}")

print("\nStep 6: Check the class definition:")
print(f"  _detect_language in ContentProcessor.__dict__: {'_detect_language' in ContentProcessor.__dict__}")
