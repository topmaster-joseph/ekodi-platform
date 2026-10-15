-- Two independent cooperative formation workspaces. No access grants are seeded.
CREATE TABLE IF NOT EXISTS cooperative_projects (
  workspace_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  snapshot_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  last_change_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cooperative_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  authority_scope TEXT NOT NULL,
  action TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES cooperative_projects(workspace_id)
);
CREATE INDEX IF NOT EXISTS idx_cooperative_audit_workspace ON cooperative_audit(workspace_id, id DESC);
CREATE TABLE IF NOT EXISTS cooperative_applications (
  workspace_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  email TEXT NOT NULL,
  representative TEXT NOT NULL,
  business TEXT,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, person_id),
  FOREIGN KEY(workspace_id) REFERENCES cooperative_projects(workspace_id)
);

INSERT OR IGNORE INTO customer_tenants(slug,name,domain,status,created_at) VALUES('jubilee-distribution','희년세상유통조합','ekodi.kr/jubilee-distribution','active',CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO cooperative_projects(workspace_id,slug,snapshot_json,revision,created_at,updated_at) VALUES('c88205a8-9a6c-4c51-ae52-508c087a2d50','jubilee-distribution','{"profile":{"name":"희년세상유통조합","legalName":"희년세상유통협동조합","legalNameStatus":"draft","chair":"정찬균","status":"formation","purpose":"자주적·자립적·자치적인 협동조합 활동을 통해 구성원의 복리증진과 상부상조, 지역경제의 균형 있는 발전에 기여합니다.","industries":"농산물·수산물 가공 및 도소매업, 통신판매업. 공산품유통업 사업자도 참여할 수 있습니다.","businesses":"농수산물 공동유통·가공·도소매, 통신판매, 공동구매·공동판매·공동브랜드, 교육·정보제공, 조합 간 협력 및 지역사회 사업","office":"광주광역시","officeConfirmed":false,"businessArea":"","jurisdiction":"광주광역시","shareUnit":10000,"firstYearBudget":null,"fiscalEndMonth":12,"directorsMinimum":3,"directorsMaximum":5,"auditorsMinimum":1,"auditorsMaximum":2,"termYears":4},"founders":[{"id":"c88205a8-9a6c-4c51-ae52-508c087a2d50:founder:1","representative":"정찬균","position":"chair-designate","business":null,"industry":null,"shares":null,"consent":"pending","accountEmail":null},{"id":"c88205a8-9a6c-4c51-ae52-508c087a2d50:founder:2","representative":"박은희","position":"founder","business":null,"industry":null,"shares":null,"consent":"pending","accountEmail":null},{"id":"c88205a8-9a6c-4c51-ae52-508c087a2d50:founder:3","representative":"최병천","position":"founder","business":null,"industry":null,"shares":null,"consent":"pending","accountEmail":null},{"id":"c88205a8-9a6c-4c51-ae52-508c087a2d50:founder:4","representative":"정양기","position":"founder","business":null,"industry":null,"shares":null,"consent":"pending","accountEmail":null},{"id":"c88205a8-9a6c-4c51-ae52-508c087a2d50:founder:5","representative":"조인식","position":"founder","business":null,"industry":null,"shares":null,"consent":"pending","accountEmail":null}],"documents":{"charter":{"status":"pending","note":""},"notice":{"status":"pending","note":""},"minutes":{"status":"pending","note":""},"officers":{"status":"pending","note":""},"plan":{"status":"pending","note":""},"budget":{"status":"pending","note":""},"capital":{"status":"pending","note":""},"founders":{"status":"pending","note":""}},"dates":{"foundingMeetingDate":"","filingDate":"","confirmationDate":"","capitalPaidDate":"","registrationDate":""},"notices":[],"meetings":[],"supports":[]}',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO public_site_controls(site_id,workspace_id,domain,public_status,updated_at) VALUES('jubilee-distribution','c88205a8-9a6c-4c51-ae52-508c087a2d50','ekodi.kr/jubilee-distribution','public',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO customer_tenants(slug,name,domain,status,created_at) VALUES('open-distribution','열린유통협동조합','ekodi.kr/open-distribution','active',CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO cooperative_projects(workspace_id,slug,snapshot_json,revision,created_at,updated_at) VALUES('ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54','open-distribution','{"profile":{"name":"열린유통협동조합","legalName":"열린유통협동조합","legalNameStatus":"draft","chair":"임동섭","status":"formation","purpose":"자주적·자립적·자치적인 협동조합 활동을 통해 구성원의 복리증진과 상부상조, 지역경제의 균형 있는 발전에 기여합니다.","industries":"농산물·수산물 가공 및 도소매업, 통신판매업. 공산품유통업 사업자도 참여할 수 있습니다.","businesses":"농수산물 공동유통·가공·도소매, 통신판매, 공동구매·공동판매·공동브랜드, 교육·정보제공, 조합 간 협력 및 지역사회 사업","office":"광주광역시","officeConfirmed":false,"businessArea":"","jurisdiction":"광주광역시","shareUnit":10000,"firstYearBudget":null,"fiscalEndMonth":12,"directorsMinimum":3,"directorsMaximum":5,"auditorsMinimum":1,"auditorsMaximum":2,"termYears":4},"founders":[{"id":"ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54:founder:1","representative":"임동섭","position":"chair-designate","business":null,"industry":null,"shares":null,"consent":"pending","accountEmail":null},{"id":"ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54:founder:2","representative":"이상호","position":"founder","business":null,"industry":null,"shares":null,"consent":"pending","accountEmail":null},{"id":"ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54:founder:3","representative":"이남현1","position":"founder","business":null,"industry":null,"shares":null,"consent":"pending","accountEmail":null},{"id":"ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54:founder:4","representative":"이남현2","position":"founder","business":null,"industry":null,"shares":null,"consent":"pending","accountEmail":null},{"id":"ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54:founder:5","representative":"이남현3","position":"founder","business":null,"industry":null,"shares":null,"consent":"pending","accountEmail":null}],"documents":{"charter":{"status":"pending","note":""},"notice":{"status":"pending","note":""},"minutes":{"status":"pending","note":""},"officers":{"status":"pending","note":""},"plan":{"status":"pending","note":""},"budget":{"status":"pending","note":""},"capital":{"status":"pending","note":""},"founders":{"status":"pending","note":""}},"dates":{"foundingMeetingDate":"","filingDate":"","confirmationDate":"","capitalPaidDate":"","registrationDate":""},"notices":[],"meetings":[],"supports":[]}',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO public_site_controls(site_id,workspace_id,domain,public_status,updated_at) VALUES('open-distribution','ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54','ekodi.kr/open-distribution','public',CURRENT_TIMESTAMP);
