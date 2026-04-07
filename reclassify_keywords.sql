-- ============================================================
-- Reclassify existing keywords into UTD department taxonomy
-- Run ONCE: docker compose exec db psql -U syllacheck -d syllacheck -f /tmp/reclassify.sql
-- ============================================================

-- Show current counts before migration
SELECT domain, COUNT(*) as count FROM keywords GROUP BY domain ORDER BY count DESC;

-- ── Reclassify existing keyword domains → UTD departments ─────────────────────

-- AI/ML → Computer Science (AI/ML is a subdiscipline of CS at UTD)
UPDATE keywords SET domain = 'Computer Science', category = 'Computer Science'
WHERE domain = 'AI/ML';

-- GenAI → Computer Science
UPDATE keywords SET domain = 'Computer Science', category = 'Computer Science'
WHERE domain = 'GenAI';

-- Software Engineering → Computer Science
UPDATE keywords SET domain = 'Computer Science', category = 'Computer Science'
WHERE domain = 'Software Engineering';

-- Data Science → Computer Science (Data Science at UTD is under CS/ECS)
UPDATE keywords SET domain = 'Computer Science', category = 'Computer Science'
WHERE domain = 'Data Science';

-- Data Engineering → Computer Science
UPDATE keywords SET domain = 'Computer Science', category = 'Computer Science'
WHERE domain = 'Data Engineering';

-- Data Governance → Information Systems (governance is an IS/management topic)
UPDATE keywords SET domain = 'Information Systems', category = 'Information Systems'
WHERE domain = 'Data Governance';

-- Cloud & DevOps → Systems Engineering (infrastructure/cloud = systems)
UPDATE keywords SET domain = 'Systems Engineering', category = 'Systems Engineering'
WHERE domain = 'Cloud & DevOps';

-- Databases → Computer Science (databases are core CS)
UPDATE keywords SET domain = 'Computer Science', category = 'Computer Science'
WHERE domain = 'Databases';

-- Product Management → Information Systems (PM is business/IS aligned)
UPDATE keywords SET domain = 'Information Systems', category = 'Information Systems'
WHERE domain = 'Product Management';

-- Project Management → Information Systems
UPDATE keywords SET domain = 'Information Systems', category = 'Information Systems'
WHERE domain = 'Project Management';

-- Domain Knowledge → Finance (most domain knowledge keywords are finance/business)
-- We'll split this manually below for better accuracy
UPDATE keywords SET domain = 'Finance', category = 'Finance'
WHERE domain = 'Domain Knowledge';

-- Soft Skills → Organizations, Strategy & Intl Mgmt (leadership/communication)
UPDATE keywords SET domain = 'Organizations, Strategy & Intl Mgmt', category = 'Organizations, Strategy & Intl Mgmt'
WHERE domain = 'Soft Skills';

-- ── Fine-tune Domain Knowledge split ──────────────────────────────────────────
-- Keywords with accounting/finance terms → Accounting
UPDATE keywords SET domain = 'Accounting', category = 'Accounting'
WHERE domain = 'Finance'
  AND (
    normalized ILIKE '%accounting%' OR normalized ILIKE '%gaap%' OR
    normalized ILIKE '%audit%' OR normalized ILIKE '%tax%' OR
    normalized ILIKE '%bookkeep%' OR normalized ILIKE '%payroll%' OR
    normalized ILIKE '%accounts_payable%' OR normalized ILIKE '%accounts_receivable%' OR
    normalized ILIKE '%financial_reporting%' OR normalized ILIKE '%cpa%'
  );

-- Keywords with marketing terms → Marketing
UPDATE keywords SET domain = 'Marketing', category = 'Marketing'
WHERE domain = 'Finance'
  AND (
    normalized ILIKE '%market%' OR normalized ILIKE '%seo%' OR
    normalized ILIKE '%brand%' OR normalized ILIKE '%campaign%' OR
    normalized ILIKE '%advertis%' OR normalized ILIKE '%crm%' OR
    normalized ILIKE '%social_media%' OR normalized ILIKE '%content%'
  );

-- Keywords with supply chain / operations terms → Operations / Supply Chain
UPDATE keywords SET domain = 'Operations / Supply Chain', category = 'Operations / Supply Chain'
WHERE domain = 'Finance'
  AND (
    normalized ILIKE '%supply_chain%' OR normalized ILIKE '%logistics%' OR
    normalized ILIKE '%procurement%' OR normalized ILIKE '%inventory%' OR
    normalized ILIKE '%lean%' OR normalized ILIKE '%six_sigma%' OR
    normalized ILIKE '%warehouse%' OR normalized ILIKE '%demand_planning%'
  );

-- Keywords with strategy / leadership terms → Organizations, Strategy & Intl Mgmt
UPDATE keywords SET domain = 'Organizations, Strategy & Intl Mgmt', category = 'Organizations, Strategy & Intl Mgmt'
WHERE domain = 'Finance'
  AND (
    normalized ILIKE '%strateg%' OR normalized ILIKE '%leadership%' OR
    normalized ILIKE '%management%' OR normalized ILIKE '%consulting%' OR
    normalized ILIKE '%organizational%' OR normalized ILIKE '%change_management%' OR
    normalized ILIKE '%international%'
  );

-- Keywords with healthcare/medical terms → Bioengineering
UPDATE keywords SET domain = 'Bioengineering', category = 'Bioengineering'
WHERE domain IN ('Finance', 'Computer Science')
  AND (
    normalized ILIKE '%clinical%' OR normalized ILIKE '%healthcare%' OR
    normalized ILIKE '%medical%' OR normalized ILIKE '%patient%' OR
    normalized ILIKE '%biomedical%' OR normalized ILIKE '%bioinformatics%' OR
    normalized ILIKE '%genomics%' OR normalized ILIKE '%pharma%' OR
    normalized ILIKE '%health_informatics%'
  );

-- ── Show results after migration ──────────────────────────────────────────────
SELECT domain, COUNT(*) as count FROM keywords GROUP BY domain ORDER BY count DESC;
