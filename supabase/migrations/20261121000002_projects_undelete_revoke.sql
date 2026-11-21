-- trigger function ไม่ต้องเรียกผ่าน API
revoke execute on function public.projects_undelete() from public, anon, authenticated;
