insert into public.departments
  (name, code, description)
values
  (
    'Water Supply',
    'WATER',
    'Water leakage, supply and pipeline related civic issues'
  ),
  (
    'Sanitation',
    'SAN',
    'Garbage collection and sanitation related issues'
  ),
  (
    'Roads',
    'ROADS',
    'Potholes, damaged roads and traffic infrastructure'
  ),
  (
    'Electrical',
    'ELEC',
    'Streetlights and electrical civic infrastructure'
  ),
  (
    'Engineering',
    'ENG',
    'General civil engineering and infrastructure issues'
  )
on conflict (name) do nothing;

insert into public.wards
  (name, code)
values
  ('Ward 01', 'W01'),
  ('Ward 02', 'W02'),
  ('Ward 03', 'W03'),
  ('Ward 04', 'W04'),
  ('Ward 05', 'W05')
on conflict (code) do nothing;