-- นำเข้าไฟล์แผนงานรายโครงการ (อัปโหลดที่หน้าโครงการ)
alter type public.import_kind add value if not exists 'plan';
