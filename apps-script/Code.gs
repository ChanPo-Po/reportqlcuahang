/***********************
 POPOPHONE STORE MANAGEMENT API
 Google Apps Script Web App
***********************/
const CFG = {
  SPREADSHEET_ID: 'PASTE_SPREADSHEET_ID_HERE',
  SESSION_HOURS: 12,
  SHEETS: {
    USERS: 'USERS',
    REPORTS: 'DAILY_REPORTS',
    TASKS: 'TASKS',
    EVALS: 'EVALUATIONS'
  }
};

function doGet() {
  return json_({success:true, service:'POPOPHONE STORE MANAGEMENT API'});
}
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '').trim();
    if (!action) return json_({success:false,message:'Missing action'});
    const routes = {
      'auth.login': () => login_(body),
      'auth.me': () => withAuth_(body, null, u => publicUser_(u)),
      'report.getToday': () => withAuth_(body, ['MANAGER'], u => getTodayReport_(u)),
      'report.saveDraft': () => withAuth_(body, ['MANAGER'], u => saveReport_(u, body.report || {}, 'DRAFT')),
      'report.submit': () => withAuth_(body, ['MANAGER'], u => saveReport_(u, body.report || {}, 'SUBMITTED')),
      'ceo.dashboard': () => withAuth_(body, ['CEO'], u => ceoDashboard_(body.date)),
      'ceo.reportDetail': () => withAuth_(body, ['CEO'], u => ceoReportDetail_(body.reportId)),
      'task.create': () => withAuth_(body, ['CEO'], u => createTask_(u, body)),
      'task.listMine': () => withAuth_(body, ['MANAGER'], u => listTasksForUser_(u)),
      'task.update': () => withAuth_(body, ['MANAGER','CEO'], u => updateTask_(u, body)),
      'evaluation.save': () => withAuth_(body, ['CEO'], u => saveEvaluation_(u, body))
    };
    if (!routes[action]) return json_({success:false,message:'Unknown action: '+action});
    return json_({success:true,data:routes[action]()});
  } catch (err) {
    return json_({success:false,message:err.message || String(err)});
  }
}

/* ---------- SETUP ---------- */
function setupSystem() {
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  ensureSheet_(ss, CFG.SHEETS.USERS, [
    'USER_ID','USERNAME','PASSWORD_HASH','SALT','FULL_NAME','ROLE','BRANCH','ACTIVE','CREATED_AT'
  ]);
  ensureSheet_(ss, CFG.SHEETS.REPORTS, [
    'REPORT_ID','REPORT_DATE','BRANCH','MANAGER_USER_ID','MANAGER_NAME','STATUS','UPDATED_AT','SUBMITTED_AT','LAST_EDIT_AT','REPORT_VERSION',
    'SHIFT','CLEANING_DONE','MEETING_DONE','ACCESSORY_CHECK','PROMOTION','OPERATION_NOTE',
    'CUSTOMER_TOTAL','CUSTOMER_INTENT','CUSTOMER_BOUGHT','CUSTOMER_FAILED','CUSTOMER_FOLLOW','CHECKIN','CUSTOMER_FAIL_REASON',
    'MACHINES_SOLD','MACHINE_REVENUE','ACCESSORY_REVENUE','WARRANTY_REVENUE','REPAIR_REVENUE','ACTUAL_REVENUE','SOFTWARE_REVENUE','REVENUE_DIFF_NOTE','CASH_AMOUNT','TRANSFER_AMOUNT','DAILY_COST','COST_NOTE',
    'FINANCE_CASES','FINANCE_DISBURSED','FINANCE_PENDING','FINANCE_NOTE',
    'STAFF_PLAN','STAFF_PRESENT','STAFF_ISSUE_COUNT','STAFF_ISSUE_NOTE','MEETING_NOTE','STAFF_MORALE',
    'INVENTORY_ISSUE','INVENTORY_NOTE',
    'REPAIR_INTAKE','REPAIR_COMPLETED','REPAIR_NOT_RETURNED','REPAIR_OVERDUE','NEGATIVE_FEEDBACK','COMPLAINT_RESOLVED','REPAIR_CSKH_NOTE',
    'REVIEW_CLIPS','DAILY_CLIPS','STORE_PHOTOS','MARKETING_NOTE',
    'URGENT_ISSUE','PROCESS_ISSUE','SCORE_STAFF','SCORE_SALES','SCORE_CSKH','SCORE_REPAIR','SCORE_OPERATION',
    'TOMORROW_PRIORITIES','TARGET_MACHINES','TARGET_REVENUE','TARGET_FOLLOW','MANAGER_PROPOSAL'
  ]);
  ensureSheet_(ss, CFG.SHEETS.TASKS, [
    'TASK_ID','TITLE','DESCRIPTION','ASSIGNED_BY_USER_ID','ASSIGNED_TO_USER_ID','ASSIGNED_TO_NAME','BRANCH','PRIORITY','DUE_DATE','STATUS','RESULT','CREATED_AT','UPDATED_AT','COMPLETED_AT'
  ]);
  ensureSheet_(ss, CFG.SHEETS.EVALS, [
    'EVAL_ID','REPORT_DATE','MANAGER_USER_ID','MANAGER_NAME','BRANCH','CEO_USER_ID','SCORE','COMMENT','CREATED_AT','UPDATED_AT'
  ]);
  return 'OK - system sheets created';
}

function createUser(username, password, fullName, role, branch) {
  role = String(role||'').toUpperCase();
  if (!['CEO','MANAGER'].includes(role)) throw new Error('ROLE must be CEO or MANAGER');
  const sh = sheet_(CFG.SHEETS.USERS);
  const rows = rowsAsObjects_(sh);
  if (rows.some(r => String(r.USERNAME).toLowerCase() === String(username).toLowerCase())) throw new Error('Username exists');
  const salt = Utilities.getUuid().replace(/-/g,'');
  const hash = hashPassword_(password, salt);
  sh.appendRow([id_('USR'),username,hash,salt,fullName,role,branch||'',true,new Date()]);
  return 'User created: '+username;
}

/* ---------- AUTH ---------- */
function login_(body) {
  const username = String(body.username||'').trim().toLowerCase();
  const password = String(body.password||'');
  if (!username || !password) throw new Error('Vui lòng nhập tài khoản và mật khẩu');
  const users = rowsAsObjects_(sheet_(CFG.SHEETS.USERS));
  const u = users.find(x => String(x.USERNAME).trim().toLowerCase() === username && truthy_(x.ACTIVE));
  if (!u || hashPassword_(password, String(u.SALT)) !== String(u.PASSWORD_HASH)) throw new Error('Sai tài khoản hoặc mật khẩu');
  const token = Utilities.getUuid()+Utilities.getUuid();
  const exp = Date.now() + CFG.SESSION_HOURS*3600*1000;
  // ScriptCache chỉ cho TTL tối đa khoảng 6 giờ; dùng ScriptProperties để phiên 12h không lỗi login.
  PropertiesService.getScriptProperties().setProperty('sess:'+token, JSON.stringify({userId:u.USER_ID,exp}));
  return {...publicUser_(u), token, expiresAt:exp};
}
function withAuth_(body, roles, fn) {
  const token = String(body.token||'');
  if (!token) throw new Error('Phiên đăng nhập hết hạn');
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('sess:'+token);
  if (!raw) throw new Error('Phiên đăng nhập hết hạn');
  const s = JSON.parse(raw);
  if (Date.now() > Number(s.exp||0)) { props.deleteProperty('sess:'+token); throw new Error('Phiên đăng nhập hết hạn'); }
  const u = rowsAsObjects_(sheet_(CFG.SHEETS.USERS)).find(x => String(x.USER_ID)===String(s.userId) && truthy_(x.ACTIVE));
  if (!u) throw new Error('Tài khoản không còn hiệu lực');
  if (roles && !roles.includes(String(u.ROLE))) throw new Error('Bạn không có quyền truy cập chức năng này');
  return fn(u);
}
function publicUser_(u){ return {userId:u.USER_ID,username:u.USERNAME,fullName:u.FULL_NAME,role:u.ROLE,branch:u.BRANCH}; }
function hashPassword_(password,salt){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt+'|'+password, Utilities.Charset.UTF_8);
  return bytes.map(b=>(b+256)%256).map(b=>('0'+b.toString(16)).slice(-2)).join('');
}

/* ---------- REPORT ---------- */
function getTodayReport_(u) {
  const date = dateKey_(new Date());
  const rows = rowsAsObjects_(sheet_(CFG.SHEETS.REPORTS));
  const r = rows.find(x => dateCellKey_(x.REPORT_DATE)===date && same_(x.BRANCH,u.BRANCH));
  return {date, report:r ? reportObjFromRow_(r) : {status:'DRAFT'}};
}
function saveReport_(u, report, requestedStatus) {
  const sh=sheet_(CFG.SHEETS.REPORTS), headers=headers_(sh), date=dateKey_(new Date());
  const rows=rowsAsObjects_(sh);
  let existing=rows.find(x=>dateCellKey_(x.REPORT_DATE)===date && same_(x.BRANCH,u.BRANCH));

  // QUY TẮC TRẠNG THÁI:
  // 1) Bấm Nộp => SUBMITTED tuyệt đối.
  // 2) Báo cáo đã SUBMITTED thì về sau bấm Lưu cũng KHÔNG được tụt lại DRAFT.
  // Muốn mở lại bản nháp phải có route/reopen riêng do CEO/Admin thực hiện.
  const existingStatus = String(existing ? existing.STATUS : '').trim().toUpperCase();
  const req = String(requestedStatus || 'DRAFT').trim().toUpperCase();
  const status = (req === 'SUBMITTED' || existingStatus === 'SUBMITTED') ? 'SUBMITTED' : 'DRAFT';
  const now = new Date();

  const obj = {
    REPORT_ID: existing ? existing.REPORT_ID : id_('RPT'),
    REPORT_DATE: date, BRANCH:u.BRANCH, MANAGER_USER_ID:u.USER_ID, MANAGER_NAME:u.FULL_NAME,
    STATUS:status,
    UPDATED_AT:now,
    LAST_EDIT_AT: existing ? now : '',
    REPORT_VERSION: existing ? Number(existing.REPORT_VERSION||1)+1 : 1,
    SUBMITTED_AT: status==='SUBMITTED'
      ? (existingStatus==='SUBMITTED' && existing && existing.SUBMITTED_AT ? existing.SUBMITTED_AT : now)
      : ''
  };
  // Chỉ nhận các field nghiệp vụ từ frontend.
  // KHÔNG cho report.status/report_id/... ghi đè metadata do backend quyết định.
  const RESERVED = new Set([
    'REPORT_ID','REPORT_DATE','BRANCH','MANAGER_USER_ID','MANAGER_NAME',
    'STATUS','UPDATED_AT','SUBMITTED_AT','LAST_EDIT_AT','REPORT_VERSION'
  ]);
  headers.forEach(h=>{
    if (RESERVED.has(h)) return;
    const k=h.toLowerCase();
    if (report[k] !== undefined) obj[h]=report[k];
  });

  // Ép metadata lần cuối. Frontend không có quyền thay STATUS.
  obj.STATUS = status;
  obj.UPDATED_AT = now;
  obj.SUBMITTED_AT = status==='SUBMITTED'
    ? (existingStatus==='SUBMITTED' && existing && existing.SUBMITTED_AT ? existing.SUBMITTED_AT : now)
    : '';

  validateReport_(obj,status);
  if(existing){
    const row=Number(existing.__row);
    const values=headers.map(h=>obj[h]!==undefined?obj[h]:existing[h]);
    sh.getRange(row,1,1,headers.length).setValues([values]);
  } else {
    sh.appendRow(headers.map(h=>obj[h]!==undefined?obj[h]:''));
  }
  return {reportId:obj.REPORT_ID,status};
}
function validateReport_(o,status){
  if(status!=='SUBMITTED') return;
  const required=['SHIFT','MEETING_DONE','CUSTOMER_TOTAL','CUSTOMER_BOUGHT','MACHINES_SOLD','ACTUAL_REVENUE','SOFTWARE_REVENUE','DAILY_COST','STAFF_PRESENT','TOMORROW_PRIORITIES'];
  const missing=required.filter(k=>o[k]===undefined || o[k]==='');
  if(missing.length) throw new Error('Chưa đủ dữ liệu bắt buộc: '+missing.join(', '));
  const n=k=>Number(o[k]||0);
  const nonNegative=['CUSTOMER_TOTAL','CUSTOMER_INTENT','CUSTOMER_BOUGHT','CUSTOMER_FAILED','CUSTOMER_FOLLOW','MACHINES_SOLD','MACHINE_REVENUE','ACCESSORY_REVENUE','WARRANTY_REVENUE','REPAIR_REVENUE','ACTUAL_REVENUE','SOFTWARE_REVENUE','CASH_AMOUNT','TRANSFER_AMOUNT','DAILY_COST','FINANCE_CASES','FINANCE_DISBURSED','FINANCE_PENDING','STAFF_PLAN','STAFF_PRESENT'];
  const bad=nonNegative.filter(k=>n(k)<0);
  if(bad.length) throw new Error('Số liệu không được âm: '+bad.join(', '));
  if(n('CUSTOMER_INTENT')>n('CUSTOMER_TOTAL')) throw new Error('Khách có nhu cầu không thể lớn hơn tổng khách đến.');
  if(n('CUSTOMER_BOUGHT')>n('CUSTOMER_INTENT')) throw new Error('Khách đã mua không thể lớn hơn khách có nhu cầu.');
  if(n('CUSTOMER_FAILED')>n('CUSTOMER_INTENT')) throw new Error('Khách chưa mua không thể lớn hơn khách có nhu cầu.');
  if(n('CUSTOMER_BOUGHT')+n('CUSTOMER_FAILED')>n('CUSTOMER_INTENT')) throw new Error('Khách đã mua + chưa mua đang lớn hơn số khách có nhu cầu.');
  if(n('STAFF_PLAN')>0 && n('STAFF_PRESENT')>n('STAFF_PLAN')) throw new Error('Nhân sự có mặt không thể lớn hơn nhân sự dự kiến.');
  const diff=n('ACTUAL_REVENUE')-n('SOFTWARE_REVENUE');
  if(Math.abs(diff)>1 && !String(o.REVENUE_DIFF_NOTE||'').trim()) throw new Error('Doanh thu thực tế và phần mềm đang lệch. Cần nhập lý do lệch doanh thu.');
  const payment=n('CASH_AMOUNT')+n('TRANSFER_AMOUNT');
  if(n('ACTUAL_REVENUE')>0 && Math.abs(payment-n('ACTUAL_REVENUE'))>1) throw new Error('Tiền mặt + chuyển khoản phải khớp tổng doanh thu thực tế.');
  const components=n('MACHINE_REVENUE')+n('ACCESSORY_REVENUE')+n('WARRANTY_REVENUE')+n('REPAIR_REVENUE');
  if(n('ACTUAL_REVENUE')>0 && Math.abs(components-n('ACTUAL_REVENUE'))>1) throw new Error('Doanh thu máy + phụ kiện + bảo hành + sửa chữa phải khớp tổng doanh thu thực tế.');
  if(n('CUSTOMER_FAILED')>0 && !String(o.CUSTOMER_FAIL_REASON||'').trim()) throw new Error('Có khách chưa mua: bắt buộc nhập lý do và hướng xử lý.');
  if(n('FINANCE_PENDING')>0 && !String(o.FINANCE_NOTE||'').trim()) throw new Error('Có giải ngân treo: bắt buộc nhập chi tiết follow.');
}
/* ---------- CEO ---------- */
function ceoDashboard_(requestedDate) {
  const today = dateKey_(new Date());
  const date = normalizeRequestedDate_(requestedDate) || today;

  // Lấy toàn bộ báo cáo và chuẩn hoá ngày + status ngay tại backend.
  // CEO KHÔNG phụ thuộc format ô ngày trong Google Sheet (Date / yyyy-MM-dd / dd/MM/yyyy).
  const allReports = rowsAsObjects_(sheet_(CFG.SHEETS.REPORTS));
  const reports = allReports.filter(r => dateCellKey_(r.REPORT_DATE) === date);
  const submitted = reports.filter(r => String(r.STATUS || '').trim().toUpperCase() === 'SUBMITTED');

  const users = rowsAsObjects_(sheet_(CFG.SHEETS.USERS))
    .filter(u => String(u.ROLE || '').trim().toUpperCase() === 'MANAGER' && truthy_(u.ACTIVE));

  const evals = rowsAsObjects_(sheet_(CFG.SHEETS.EVALS))
    .filter(e => dateCellKey_(e.REPORT_DATE) === date);

  // Ghép danh sách chi nhánh từ USERS + báo cáo thực tế.
  // Như vậy báo cáo đã SUBMITTED vẫn hiện trên CEO kể cả khi USERS có lỗi ACTIVE/branch.
  const branchMap = new Map();

  users.forEach(u => {
    const key=String(u.BRANCH||'').trim().toLowerCase() || String(u.USER_ID||'').trim();
    const r = reports.find(x => same_(x.BRANCH,u.BRANCH));
    if(!branchMap.has(key) || r) branchMap.set(key, { user:u, report:r || null });
  });

  reports.forEach(r => {
    const key=String(r.BRANCH||'').trim().toLowerCase() || ('REPORT-' + String(r.REPORT_ID || ''));
    const already = branchMap.has(key) && branchMap.get(key).report;
    if (!already) {
      branchMap.set(key, {
        user: {
          USER_ID: r.MANAGER_USER_ID || '',
          FULL_NAME: r.MANAGER_NAME || 'QL cửa hàng',
          BRANCH: r.BRANCH || ''
        },
        report: r
      });
    }
  });

  const branches = [...branchMap.values()].map(({user:u, report:r}) => {
    const revenue = Number(r?.ACTUAL_REVENUE || 0);
    const machines = Number(r?.MACHINES_SOLD || 0);
    const ct = Number(r?.CUSTOMER_INTENT || 0);
    const cb = Number(r?.CUSTOMER_BOUGHT || 0);
    const status = String(r?.STATUS || 'NOT_SUBMITTED').trim().toUpperCase();
    return {
      branch: r?.BRANCH || u.BRANCH || '',
      managerName: r?.MANAGER_NAME || u.FULL_NAME || '',
      status,
      reportId: r?.REPORT_ID || '',
      revenue,
      machines,
      conversion: ct ? round1_(cb / ct * 100) : 0,
      financePending: Number(r?.FINANCE_PENDING || 0),
      managerProposal: r?.MANAGER_PROPOSAL || ''
    };
  });

  const revenue = sum_(submitted, 'ACTUAL_REVENUE');
  const target = sum_(submitted, 'TARGET_REVENUE');
  const intent = sum_(submitted, 'CUSTOMER_INTENT');
  const bought = sum_(submitted, 'CUSTOMER_BOUGHT');
  const issues = buildIssues_(submitted);

  const managerKeys = new Map();
  users.forEach(u => managerKeys.set(String(u.USER_ID || '').trim(), u));
  reports.forEach(r => {
    const uid = String(r.MANAGER_USER_ID || '').trim();
    if (!managerKeys.has(uid)) managerKeys.set(uid, {
      USER_ID: uid,
      FULL_NAME: r.MANAGER_NAME || 'QL cửa hàng',
      BRANCH: r.BRANCH || ''
    });
  });

  const managers = [...managerKeys.values()].map(u => {
    const uid = String(u.USER_ID || '').trim();
    const r = reports.find(x => String(x.MANAGER_USER_ID || '').trim() === uid) || {};
    const ev = evals.filter(e => String(e.MANAGER_USER_ID || '').trim() === uid).slice(-1)[0];
    return {
      userId: u.USER_ID,
      fullName: r.MANAGER_NAME || u.FULL_NAME,
      branch: r.BRANCH || u.BRANCH,
      selfSales: Number(r.SCORE_SALES || 0),
      selfOperation: Number(r.SCORE_OPERATION || 0),
      selfStaff: Number(r.SCORE_STAFF || 0),
      selfCskh: Number(r.SCORE_CSKH || 0),
      selfRepair: Number(r.SCORE_REPAIR || 0),
      ceoScore: ev ? Number(ev.SCORE) : null
    };
  });

  const availableDates = [...new Set(allReports
    .map(r => dateCellKey_(r.REPORT_DATE))
    .filter(Boolean))]
    .sort()
    .reverse();

  return {
    date,
    today,
    availableDates,
    kpis: {
      revenue,
      targetRate: target ? round1_(revenue / target * 100) : 0,
      machines: sum_(submitted, 'MACHINES_SOLD'),
      conversion: intent ? round1_(bought / intent * 100) : 0,
      cost: sum_(submitted, 'DAILY_COST'),
      financePending: sum_(submitted, 'FINANCE_PENDING'),
      ceoIssues: issues.filter(x => x.requiresCEO).length,
      submittedManagers: new Set(submitted.map(r=>String(r.BRANCH||'').trim().toLowerCase())).size,
      totalManagers: branches.length
    },
    branches,
    issues,
    managers,
    tasks: listTasksForCEO_(date),
    debug: {
      today,
      selectedDate: date,
      totalReportRows: allReports.length,
      todayReportRows: reports.length,
      submittedRows: submitted.length,
      reportIds: reports.map(r => String(r.REPORT_ID || ''))
    }
  };
}

function buildIssues_(reports){
  const out=[];
  reports.forEach(r=>{
    if(Number(r.FINANCE_PENDING||0)>0) out.push({title:'Giải ngân đang treo',description:`${r.BRANCH}: ${fmtNum_(r.FINANCE_PENDING)}đ. ${r.FINANCE_NOTE||''}`,branch:r.BRANCH,level:'MEDIUM',requiresCEO:false});
    if(String(r.INVENTORY_ISSUE||'').trim()) out.push({title:'Vấn đề kho/phụ kiện',description:`${r.BRANCH}: ${r.INVENTORY_ISSUE}`,branch:r.BRANCH,level:'MEDIUM',requiresCEO:false});
    if(String(r.MANAGER_PROPOSAL||'').trim()) out.push({title:'Đề xuất từ QL '+r.BRANCH,description:String(r.MANAGER_PROPOSAL),branch:r.BRANCH,level:'HIGH',requiresCEO:true});
    if(Number(r.CUSTOMER_FAILED||0)>=3 && String(r.CUSTOMER_FAIL_REASON||'').trim()) out.push({title:'Tỷ lệ mất cơ hội bán cần xem',description:`${r.BRANCH}: ${r.CUSTOMER_FAILED} khách chưa mua. ${r.CUSTOMER_FAIL_REASON}`,branch:r.BRANCH,level:'HIGH',requiresCEO:true});
  });
  return out;
}
function ceoReportDetail_(reportId){
  const r=rowsAsObjects_(sheet_(CFG.SHEETS.REPORTS)).find(x=>String(x.REPORT_ID)===String(reportId));
  if(!r) throw new Error('Không tìm thấy báo cáo');
  return reportObjFromRow_(r);
}

/* ---------- TASK ---------- */
function createTask_(ceo, body){
  let assignee=null;
  const managers=rowsAsObjects_(sheet_(CFG.SHEETS.USERS)).filter(u=>
    String(u.ROLE||'').trim().toUpperCase()==='MANAGER' && truthy_(u.ACTIVE)
  );

  const assignedId = String(body.assignedToUserId||'').trim();
  const branch = String(body.branch||'').trim().toLowerCase();

  if(assignedId){
    assignee=managers.find(u=>String(u.USER_ID||'').trim()===assignedId);
  }
  if(!assignee && branch){
    assignee=managers.find(u=>String(u.BRANCH||'').trim().toLowerCase()===branch);
  }
  if(!assignee){
    throw new Error('Không xác định được QL nhận việc. Hãy chọn QL cửa hàng trước khi giao.');
  }
  if(!String(body.title||'').trim()) throw new Error('Nội dung công việc không được để trống');
  const priority=String(body.priority||'MEDIUM').trim().toUpperCase();
  if(!['LOW','MEDIUM','HIGH'].includes(priority)) throw new Error('Mức ưu tiên không hợp lệ');

  sheet_(CFG.SHEETS.TASKS).appendRow([
    id_('TSK'),String(body.title||'').trim(),String(body.description||'').trim(),ceo.USER_ID,
    assignee.USER_ID,assignee.FULL_NAME,assignee.BRANCH,priority,
    body.dueDate||'','TODO','',new Date(),new Date(),''
  ]);
  return {ok:true,assignedToUserId:assignee.USER_ID,assignedToName:assignee.FULL_NAME,branch:assignee.BRANCH};
}
function listTasksForUser_(u){
  return rowsAsObjects_(sheet_(CFG.SHEETS.TASKS))
    .filter(t=>String(t.ASSIGNED_TO_USER_ID)===String(u.USER_ID))
    .sort((a,b)=>new Date(b.UPDATED_AT||b.CREATED_AT||0)-new Date(a.UPDATED_AT||a.CREATED_AT||0));
}
function listTasksForCEO_(date){
  const today=dateKey_(new Date());
  return rowsAsObjects_(sheet_(CFG.SHEETS.TASKS))
    .filter(t=>{const st=String(t.STATUS||'TODO').toUpperCase(); const touched=dateCellKey_(t.CREATED_AT)===date || dateCellKey_(t.UPDATED_AT)===date || dateCellKey_(t.COMPLETED_AT)===date; return !date || (date===today ? (!['APPROVED'].includes(st) || touched) : touched);})
    .map(t=>({taskId:t.TASK_ID,title:t.TITLE,description:t.DESCRIPTION,branch:t.BRANCH,assignedToName:t.ASSIGNED_TO_NAME,priority:t.PRIORITY,dueDate:t.DUE_DATE,status:String(t.STATUS||'TODO').toUpperCase(),result:t.RESULT||'',createdAt:t.CREATED_AT,updatedAt:t.UPDATED_AT,completedAt:t.COMPLETED_AT}))
    .sort((a,b)=>String(a.status)==='DONE'?-1:String(b.status)==='DONE'?1:0);
}
function updateTask_(u,body){
  const sh=sheet_(CFG.SHEETS.TASKS),headers=headers_(sh),rows=rowsAsObjects_(sh);
  const t=rows.find(x=>String(x.TASK_ID)===String(body.taskId)); if(!t)throw new Error('Task not found');
  const role=String(u.ROLE||'').toUpperCase();
  if(role==='MANAGER' && String(t.ASSIGNED_TO_USER_ID)!==String(u.USER_ID)) throw new Error('Không có quyền sửa task này');
  const allowed=['TODO','IN_PROGRESS','DONE','APPROVED'];
  const next=String(body.status||t.STATUS||'TODO').toUpperCase();
  if(!allowed.includes(next)) throw new Error('Trạng thái công việc không hợp lệ');
  if(role==='MANAGER' && next==='APPROVED') throw new Error('Chỉ CEO được duyệt công việc');
  if(role==='CEO' && next==='DONE') throw new Error('CEO chỉ duyệt DONE thành APPROVED hoặc trả lại IN_PROGRESS');
  if(role==='CEO' && next==='APPROVED' && String(t.STATUS||'').toUpperCase()!=='DONE') throw new Error('Chỉ duyệt được công việc QL đã báo hoàn tất');
  if(role==='MANAGER' && next==='DONE' && !String(body.result!==undefined?body.result:t.RESULT||'').trim()) throw new Error('Cần nhập kết quả xử lý trước khi báo hoàn tất');
  const patch={STATUS:next,RESULT:body.result!==undefined?String(body.result):t.RESULT,UPDATED_AT:new Date()};
  if(next==='DONE' || next==='APPROVED') patch.COMPLETED_AT=new Date();
  if(next==='TODO' || next==='IN_PROGRESS') patch.COMPLETED_AT='';
  const vals=headers.map(h=>patch[h]!==undefined?patch[h]:t[h]); sh.getRange(Number(t.__row),1,1,headers.length).setValues([vals]); return {ok:true,status:next};
}
/* ---------- EVALUATION ---------- */
function saveEvaluation_(ceo,body){
  const managers=rowsAsObjects_(sheet_(CFG.SHEETS.USERS));
  const m=managers.find(x=>String(x.USER_ID)===String(body.managerUserId)&&String(x.ROLE).toUpperCase()==='MANAGER'); if(!m)throw new Error('Không tìm thấy QL');
  const score=Number(body.score); if(!(score>=0&&score<=10)) throw new Error('Điểm phải từ 0 đến 10');
  const date=normalizeRequestedDate_(body.reportDate)||dateKey_(new Date());
  const sh=sheet_(CFG.SHEETS.EVALS), h=headers_(sh), rows=rowsAsObjects_(sh);
  const old=rows.find(x=>dateCellKey_(x.REPORT_DATE)===date && String(x.MANAGER_USER_ID)===String(m.USER_ID));
  const now=new Date();
  const obj={EVAL_ID:old?old.EVAL_ID:id_('EVA'),REPORT_DATE:date,MANAGER_USER_ID:m.USER_ID,MANAGER_NAME:m.FULL_NAME,BRANCH:m.BRANCH,CEO_USER_ID:ceo.USER_ID,SCORE:score,COMMENT:body.comment||'',CREATED_AT:old?old.CREATED_AT:now,UPDATED_AT:now};
  if(old) sh.getRange(Number(old.__row),1,1,h.length).setValues([h.map(k=>obj[k]!==undefined?obj[k]:old[k])]);
  else sh.appendRow(h.map(k=>obj[k]!==undefined?obj[k]:''));
  return {ok:true};
}
/* ---------- HELPERS ---------- */
function sheet_(name){return SpreadsheetApp.openById(CFG.SPREADSHEET_ID).getSheetByName(name) || (()=>{throw new Error('Missing sheet '+name)})();}
function ensureSheet_(ss,name,headers){let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);if(sh.getLastRow()===0){sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');return sh;}const current=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];const missing=headers.filter(h=>!current.includes(h));if(missing.length)sh.getRange(1,current.length+1,1,missing.length).setValues([missing]).setFontWeight('bold');return sh}
function headers_(sh){return sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]}
function rowsAsObjects_(sh){const lr=sh.getLastRow(),lc=sh.getLastColumn();if(lr<2)return[];const h=sh.getRange(1,1,1,lc).getDisplayValues()[0],v=sh.getRange(2,1,lr-1,lc).getValues();return v.map((r,i)=>{const o={__row:i+2};h.forEach((x,j)=>o[x]=r[j]);return o})}
function reportObjFromRow_(r){const o={};Object.keys(r).forEach(k=>{if(k==='__row')return;o[k.toLowerCase()]=r[k]});o.status=r.STATUS;o.reportId=r.REPORT_ID;o.reportDate=r.REPORT_DATE;o.branch=r.BRANCH;o.managerName=r.MANAGER_NAME;return o}
function normalizeRequestedDate_(v){
  const s=String(v||'').trim();
  if(!s) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(m) return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
  const d=new Date(s);
  return isNaN(d.getTime())?'':dateKey_(d);
}
function dateKey_(d){return Utilities.formatDate(d,Session.getScriptTimeZone()||'Asia/Ho_Chi_Minh','yyyy-MM-dd')}
function dateCellKey_(v){
  if (v instanceof Date && !isNaN(v.getTime())) return dateKey_(v);
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Google Sheet có thể trả display dạng dd/MM/yyyy hoặc dd/MM/yyyy HH:mm:ss.
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
  if (m) return m[3] + '-' + String(m[2]).padStart(2,'0') + '-' + String(m[1]).padStart(2,'0');

  // Hỗ trợ dd-MM-yyyy.
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s|$)/);
  if (m) return m[3] + '-' + String(m[2]).padStart(2,'0') + '-' + String(m[1]).padStart(2,'0');

  const d = new Date(s);
  return isNaN(d.getTime()) ? s : dateKey_(d);
}
function same_(a,b){return String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase()}
function id_(p){return p+'-'+Utilities.getUuid().split('-')[0].toUpperCase()}
function sum_(rows,key){return rows.reduce((s,r)=>s+Number(r[key]||0),0)}
function round1_(n){return Math.round(Number(n)*10)/10}
function truthy_(v){return v===true||String(v).toUpperCase()==='TRUE'||String(v)==='1'}
function fmtNum_(n){return new Intl.NumberFormat('vi-VN').format(Number(n||0))}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)}
