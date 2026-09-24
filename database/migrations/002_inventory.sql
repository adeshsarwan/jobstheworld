CREATE TABLE IF NOT EXISTS job_inventory_buckets (
 country_code CHAR(2) NOT NULL,
 category_slug VARCHAR(100) NOT NULL,
 usable_count INT UNSIGNED NOT NULL DEFAULT 0,
 fresh_3d_count INT UNSIGNED NOT NULL DEFAULT 0,
 healthy BOOLEAN NOT NULL DEFAULT FALSE,
 last_evaluated_at DATETIME(3) NULL,
 last_refresh_attempt_at DATETIME(3) NULL,
 last_refresh_success_at DATETIME(3) NULL,
 cooldown_until DATETIME(3) NULL,
 lock_until DATETIME(3) NULL,
 last_refresh_reason VARCHAR(80) NULL,
 last_error VARCHAR(255) NULL,
 PRIMARY KEY (country_code, category_slug)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS job_refresh_audit (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 trigger_type VARCHAR(10) NOT NULL,
 country_code CHAR(2) NOT NULL,
 category_slug VARCHAR(100) NOT NULL,
 query_text VARCHAR(500) NOT NULL,
 usable_count INT UNSIGNED NOT NULL,
 fresh_3d_count INT UNSIGNED NOT NULL,
 decision VARCHAR(80) NOT NULL,
 upstream_request_count INT UNSIGNED NOT NULL DEFAULT 0,
 http_status INT NULL,
 safe_headers JSON NULL,
 jobs_returned INT UNSIGNED NOT NULL DEFAULT 0,
 inserted_count INT UNSIGNED NOT NULL DEFAULT 0,
 updated_count INT UNSIGNED NOT NULL DEFAULT 0,
 failed_count INT UNSIGNED NOT NULL DEFAULT 0,
 status VARCHAR(30) NOT NULL,
 error_text VARCHAR(255) NULL,
 started_at DATETIME(3) NOT NULL,
 completed_at DATETIME(3) NULL,
 cooldown_until DATETIME(3) NULL,
 KEY idx_refresh_bucket (country_code,category_slug,started_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS jsearch_request_budgets (
 period_key VARCHAR(20) PRIMARY KEY,
 request_count INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS jsearch_refresh_state (
 id TINYINT PRIMARY KEY,
 blocked BOOLEAN NOT NULL DEFAULT FALSE,
 blocked_at DATETIME(3) NULL,
 safe_headers JSON NULL,
 next_request_at DATETIME(3) NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO jsearch_refresh_state(id) VALUES (1);
