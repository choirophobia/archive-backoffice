CREATE TABLE IF NOT EXISTS upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID REFERENCES users(id),
  filename TEXT NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed', -- pending | completed | failed
  created_at TIMESTAMPTZ DEFAULT now()
);
