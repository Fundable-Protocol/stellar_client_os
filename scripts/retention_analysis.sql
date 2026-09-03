-- Monthly Retention Cohort Analysis
-- Cohort: Sponsors grouped by their month of first sponsorship
-- Metric: Percentage of sponsors active in each subsequent month

WITH cohort_data AS (
  SELECT
    sponsor_address,
    DATE_TRUNC('month', signup_date) AS signup_month
  FROM sponsor_signups
),
activity_data AS (
  SELECT
    sponsor_address,
    DATE_TRUNC('month', created_at) AS activity_month
  FROM sponsorships
),
cohort_sizes AS (
  SELECT
    signup_month,
    COUNT(sponsor_address) AS cohort_size
  FROM cohort_data
  GROUP BY signup_month
),
retention_data AS (
  SELECT
    c.signup_month,
    a.activity_month,
    COUNT(DISTINCT a.sponsor_address) AS active_sponsors
  FROM cohort_data c
  JOIN activity_data a ON c.sponsor_address = a.sponsor_address
  GROUP BY c.signup_month, a.activity_month
)
SELECT
  rd.signup_month,
  cs.cohort_size,
  rd.activity_month,
  rd.active_sponsors,
  ROUND((rd.active_sponsors::numeric / cs.cohort_size::numeric) * 100, 2) AS retention_rate
FROM retention_data rd
JOIN cohort_sizes cs ON rd.signup_month = cs.signup_month
ORDER BY rd.signup_month, rd.activity_month;
