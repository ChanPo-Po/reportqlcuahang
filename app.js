const API = window.APP_CONFIG.API_URL;
let session = null;
let currentReport = null;
let ceoManagers = [];
let ceoSelectedDate = '';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money = n => new Intl.NumberFormat('vi-VN').format(Number(n||0)) + 'đ';

async function api(action, data={}) {
  if (!API || API.includes('PASTE_YOUR')) throw new Error('Chưa cấu hình API_URL trong frontend/config.js');
  const payload = {action, ...data};
  if (session?.token) payload.token = session.token;
  const res = await fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'API error');
  return json.data;
}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2500)}
function showMain(){ $('#loginView').classList.add('hidden'); $('#mainView').classList.remove('hidden'); $('#userBadge').textContent=`${session.fullName} · ${session.role}${session.branch?' · '+session.branch:''}`; renderByRole(); }
function logout(){ localStorage.removeItem('popo_session'); session=null; location.reload(); }

async function login(){
  $('#loginError').classList.add('hidden');
  try{
    const data=await api('auth.login',{username:$('#loginUsername').value.trim(),password:$('#loginPassword').value});
    session=data; localStorage.setItem('popo_session',JSON.stringify(data)); showMain();
  }catch(e){$('#loginError').textContent=e.message;$('#loginError').classList.remove('hidden')}
}

async function restore(){
  const raw=localStorage.getItem('popo_session'); if(!raw)return;
  try{session=JSON.parse(raw); const me=await api('auth.me'); session={...session,...me}; localStorage.setItem('popo_session',JSON.stringify(session)); showMain();}
  catch(e){localStorage.removeItem('popo_session');session=null}
}
function renderByRole(){
  if(session.role==='CEO'){
    $('#managerApp').classList.add('hidden'); $('#ceoApp').classList.remove('hidden'); $('#headerSubtitle').textContent='CEO Executive Dashboard'; loadCEO();
  }else if(session.role==='MANAGER'){
    $('#ceoApp').classList.add('hidden'); $('#managerApp').classList.remove('hidden'); $('#headerSubtitle').textContent='Báo cáo quản lý cửa hàng'; loadManager();
  }else { logout(); }
}

async function loadManager(){
  $('#managerApp').innerHTML='<div class="card">Đang tải báo cáo & công việc CEO giao...</div>';
  try{
    const [reportData, taskRows] = await Promise.all([
      api('report.getToday'),
      api('task.listMine')
    ]);
    currentReport=reportData;
    renderManager(currentReport, Array.isArray(taskRows)?taskRows:[]);
  }catch(e){$('#managerApp').innerHTML=`<div class="alert danger">${esc(e.message)}</div>`}
}

function normalizeTask(t){
  return {
    taskId: t.taskId || t.TASK_ID || '',
    title: t.title || t.TITLE || '',
    description: t.description || t.DESCRIPTION || '',
    priority: t.priority || t.PRIORITY || 'MEDIUM',
    dueDate: t.dueDate || t.DUE_DATE || '',
    status: t.status || t.STATUS || 'TODO',
    result: t.result || t.RESULT || '',
    branch: t.branch || t.BRANCH || ''
  };
}
function taskStatusLabel(s){return ({TODO:'CHƯA LÀM',IN_PROGRESS:'ĐANG LÀM',DONE:'ĐÃ XONG',APPROVED:'CEO ĐÃ DUYỆT'})[String(s||'').toUpperCase()]||String(s||'');}
function taskPriorityLabel(s){return ({HIGH:'CAO',MEDIUM:'VỪA',LOW:'THẤP'})[String(s||'').toUpperCase()]||String(s||'');}

function renderManager(r, taskRows=[]){
  const d=r.report||{};
  // Giá trị mặc định phải tồn tại trong object, không chỉ hiển thị trên select.
  // Nếu không, người dùng không đụng vào select thì backend sẽ tưởng là thiếu dữ liệu khi submit.
  if (d.shift == null || d.shift === '') d.shift = 'Cả ngày';
  if (d.cleaning_done == null || d.cleaning_done === '') d.cleaning_done = 'YES';
  if (d.meeting_done == null || d.meeting_done === '') d.meeting_done = 'YES';
  if (d.accessory_check == null || d.accessory_check === '') d.accessory_check = 'OK';
  if (d.store_photos == null || d.store_photos === '') d.store_photos = 'YES';
  const myTasks = taskRows.map(normalizeTask);
  const openTasks = myTasks.filter(t=>!['DONE','APPROVED'].includes(String(t.status).toUpperCase()));
  $('#managerApp').innerHTML=`
  <section class="card" style="margin-bottom:15px">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
      <div><h2 style="margin:0">📌 Việc CEO giao</h2><p class="muted" style="margin:4px 0 0">${openTasks.length} việc đang cần xử lý · ${myTasks.length} việc tổng cộng</p></div>
      <button type="button" class="ghost" id="refreshMyTasksBtn">Làm mới công việc</button>
    </div>
    <div id="myTaskList" style="margin-top:12px">
      ${myTasks.length ? myTasks.map(t=>`
        <div class="task" style="margin-bottom:10px" data-task-id="${esc(t.taskId)}">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
            <div style="flex:1;min-width:240px">
              <div><span class="badge ${String(t.priority).toUpperCase()==='HIGH'?'bred':'borange'}">${esc(taskPriorityLabel(t.priority))}</span> <span class="badge ${['DONE','APPROVED'].includes(String(t.status).toUpperCase())?'bgreen':'borange'}">${esc(taskStatusLabel(t.status))}</span></div>
              <h3 style="margin:8px 0 4px">${esc(t.title)}</h3>
              ${t.description?`<p class="muted" style="margin:0 0 6px">${esc(t.description)}</p>`:''}
              <small>Deadline: <b>${esc(t.dueDate||'Chưa đặt')}</b></small>
            </div>
            <div style="min-width:260px;flex:0 1 360px">
              <label>Kết quả / cập nhật cho CEO</label>
              <textarea class="taskResult" rows="2" ${String(t.status).toUpperCase()==='APPROVED'?'disabled':''}>${esc(t.result)}</textarea>
              ${String(t.status).toUpperCase()==='APPROVED' ? '' : `<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px;flex-wrap:wrap">
                <button type="button" class="ghost taskProgressBtn">Đang làm</button>
                <button type="button" class="primary taskDoneBtn">Hoàn tất</button>
              </div>`}
            </div>
          </div>
        </div>`).join('') : '<div class="alert ok">Hiện CEO chưa giao việc nào cho bạn.</div>'}
    </div>
  </section>
  <div class="toolbar">
    <div class="field"><label>NGÀY BÁO CÁO</label><input value="${esc(r.date)}" readonly></div>
    <div class="field"><label>CHI NHÁNH</label><input value="${esc(session.branch)}" readonly></div>
    <div class="field"><label>NGƯỜI BÁO CÁO</label><input value="${esc(session.fullName)}" readonly></div>
    <div><span class="badge ${d.status==='SUBMITTED'?'bgreen':'borange'}">${d.status==='SUBMITTED'?'ĐÃ NỘP':'BẢN NHÁP'}</span></div>
  </div>
  <div class="stepnav" style="margin-top:15px">
    <aside class="menu card">
      <h2>Tiến độ báo cáo</h2><div class="progress"><i id="mgrProg" style="width:10%"></i></div><p class="muted" id="mgrProgTxt">1/10 mục</p>
      ${['Vận hành','Khách hàng','Doanh thu & chi phí','Giải ngân','Nhân sự & họp','Kho & phụ kiện','Sửa chữa & CSKH','Marketing','Sự cố & đánh giá','Kế hoạch ngày mai'].map((x,i)=>`<button class="mstep ${i===0?'active':''}" data-i="${i}">${i+1}. ${x}</button>`).join('')}
    </aside>
    <main id="managerPane"></main>
  </div>`;
  $('#refreshMyTasksBtn').onclick=()=>loadManager();
  document.querySelectorAll('[data-task-id]').forEach(row=>{
    const taskId=row.dataset.taskId;
    const resultEl=row.querySelector('.taskResult');
    const saveStatus=async(status)=>{
      try{
        await api('task.update',{taskId,status,result:resultEl?resultEl.value:''});
        toast(status==='DONE'?'✅ Đã báo hoàn tất công việc lên CEO':'Đã cập nhật trạng thái công việc');
        await loadManager();
      }catch(e){toast('❌ '+e.message)}
    };
    const p=row.querySelector('.taskProgressBtn'); if(p)p.onclick=()=>saveStatus('IN_PROGRESS');
    const dn=row.querySelector('.taskDoneBtn'); if(dn)dn.onclick=()=>saveStatus('DONE');
  });
  document.querySelectorAll('.mstep').forEach(b=>b.onclick=()=>{document.querySelectorAll('.mstep').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderManagerPane(+b.dataset.i,d);$('#mgrProg').style.width=((+b.dataset.i+1)*10)+'%';$('#mgrProgTxt').textContent=(+b.dataset.i+1)+'/10 mục';});
  renderManagerPane(0,d);
}

function val(d,k,def=''){return d[k] ?? def}
function renderManagerPane(i,d){
 const p=$('#managerPane');
 const fields = {
  0:`<section class="card"><h2>1. Vận hành cửa hàng</h2><div class="grid2">
      <div><label>Ca làm</label><select data-k="shift"><option ${val(d,'shift')==='Cả ngày'?'selected':''}>Cả ngày</option><option>Ca sáng</option><option>Ca chiều</option></select></div>
      <div><label>Checklist vệ sinh</label><select data-k="cleaning_done"><option value="YES">Đã hoàn tất</option><option value="NO">Chưa hoàn tất</option></select></div>
      <div><label>Họp đầu giờ</label><select data-k="meeting_done"><option value="YES">Đã họp</option><option value="NO">Chưa họp</option></select></div>
      <div><label>Kiểm phụ kiện</label><select data-k="accessory_check"><option value="OK">Khớp</option><option value="DIFF">Có lệch</option></select></div>
      <div style="grid-column:1/-1"><label>Chương trình hiện tại</label><input data-k="promotion" value="${esc(val(d,'promotion'))}"></div>
      <div style="grid-column:1/-1"><label>Ghi chú vận hành</label><textarea data-k="operation_note" rows="4">${esc(val(d,'operation_note'))}</textarea></div></div></section>`,
  1:`<section class="card"><h2>2. Khách hàng & cơ hội bán</h2><div class="grid3">
      <div><label>Khách đến</label><input type="number" data-k="customer_total" value="${esc(val(d,'customer_total',0))}"></div>
      <div><label>Có nhu cầu mua</label><input type="number" data-k="customer_intent" value="${esc(val(d,'customer_intent',0))}"></div>
      <div><label>Đã mua</label><input type="number" data-k="customer_bought" value="${esc(val(d,'customer_bought',0))}"></div>
      <div><label>Chưa mua</label><input type="number" data-k="customer_failed" value="${esc(val(d,'customer_failed',0))}"></div>
      <div><label>Có thể follow</label><input type="number" data-k="customer_follow" value="${esc(val(d,'customer_follow',0))}"></div>
      <div><label>Check-in</label><input type="number" data-k="checkin" value="${esc(val(d,'checkin',0))}"></div></div>
      <label style="margin-top:12px">Lý do khách chưa mua / dòng máy / hướng xử lý</label><textarea data-k="customer_fail_reason" rows="5">${esc(val(d,'customer_fail_reason'))}</textarea></section>`,
  2:`<section class="card"><h2>3. Doanh thu & chi phí</h2><div class="grid3">
      ${[['machines_sold','Máy bán'],['machine_revenue','Doanh thu máy'],['accessory_revenue','Phụ kiện'],['warranty_revenue','Bảo hành'],['repair_revenue','Sửa chữa'],['actual_revenue','Tổng thực tế'],['software_revenue','Doanh thu phần mềm'],['cash_amount','Tiền mặt'],['transfer_amount','Chuyển khoản'],['daily_cost','Tổng chi phí']].map(([k,l])=>`<div><label>${l}</label><input type="number" data-k="${k}" value="${esc(val(d,k,0))}"></div>`).join('')}
      </div><label style="margin-top:12px">Chi tiết chi phí</label><textarea data-k="cost_note" rows="4">${esc(val(d,'cost_note'))}</textarea></section>`,
  3:`<section class="card"><h2>4. Góp & giải ngân</h2><div class="grid3">
      <div><label>Hồ sơ</label><input type="number" data-k="finance_cases" value="${esc(val(d,'finance_cases',0))}"></div>
      <div><label>Đã giải ngân</label><input type="number" data-k="finance_disbursed" value="${esc(val(d,'finance_disbursed',0))}"></div>
      <div><label>Chờ giải ngân</label><input type="number" data-k="finance_pending" value="${esc(val(d,'finance_pending',0))}"></div></div>
      <label style="margin-top:12px">Chi tiết hồ sơ treo + người follow + deadline</label><textarea data-k="finance_note" rows="5">${esc(val(d,'finance_note'))}</textarea></section>`,
  4:`<section class="card"><h2>5. Nhân sự & họp</h2><div class="grid3">
      <div><label>Dự kiến</label><input type="number" data-k="staff_plan" value="${esc(val(d,'staff_plan',0))}"></div><div><label>Có mặt</label><input type="number" data-k="staff_present" value="${esc(val(d,'staff_present',0))}"></div><div><label>Vắng/trễ</label><input type="number" data-k="staff_issue_count" value="${esc(val(d,'staff_issue_count',0))}"></div></div>
      <label style="margin-top:12px">Vắng/trễ + lý do</label><textarea data-k="staff_issue_note" rows="3">${esc(val(d,'staff_issue_note'))}</textarea>
      <label>Nội dung họp</label><textarea data-k="meeting_note" rows="4">${esc(val(d,'meeting_note'))}</textarea>
      <label>Đánh giá tinh thần/ thái độ</label><textarea data-k="staff_morale" rows="3">${esc(val(d,'staff_morale'))}</textarea></section>`,
  5:`<section class="card"><h2>6. Kho & phụ kiện</h2>
      <label>Phát sinh lệch / SKU / giá trị / nguyên nhân / xử lý / người phụ trách / deadline</label><textarea data-k="inventory_issue" rows="7">${esc(val(d,'inventory_issue'))}</textarea>
      <label>Máy NEW nhập KK / hàng lỗi / hàng bất thường</label><textarea data-k="inventory_note" rows="4">${esc(val(d,'inventory_note'))}</textarea></section>`,
  6:`<section class="card"><h2>7. Sửa chữa & CSKH</h2><div class="grid3">
      ${[['repair_intake','Nhận sửa'],['repair_completed','Hoàn tất'],['repair_not_returned','Chưa trả'],['repair_overdue','Quá hẹn'],['negative_feedback','Feedback xấu'],['complaint_resolved','Đã xử lý']].map(([k,l])=>`<div><label>${l}</label><input type="number" data-k="${k}" value="${esc(val(d,k,0))}"></div>`).join('')}</div>
      <label style="margin-top:12px">Vấn đề / complaint / hướng xử lý</label><textarea data-k="repair_cskh_note" rows="5">${esc(val(d,'repair_cskh_note'))}</textarea></section>`,
  7:`<section class="card"><h2>8. Marketing</h2><div class="grid3">
      <div><label>Clip review khách</label><input type="number" data-k="review_clips" value="${esc(val(d,'review_clips',0))}"></div><div><label>Clip Daily</label><input type="number" data-k="daily_clips" value="${esc(val(d,'daily_clips',0))}"></div><div><label>Ảnh cửa hàng</label><select data-k="store_photos"><option value="YES">Đã chụp</option><option value="NO">Chưa chụp</option></select></div></div>
      <label style="margin-top:12px">Ghi chú Marketing</label><textarea data-k="marketing_note" rows="4">${esc(val(d,'marketing_note'))}</textarea></section>`,
  8:`<section class="card"><h2>9. Sự cố & tự đánh giá</h2><div class="grid2"><div><label>Sự cố khẩn cấp</label><textarea data-k="urgent_issue" rows="3">${esc(val(d,'urgent_issue'))}</textarea></div><div><label>Lỗi nội bộ/quy trình</label><textarea data-k="process_issue" rows="3">${esc(val(d,'process_issue'))}</textarea></div></div>
      <div class="grid3" style="margin-top:12px">${[['score_staff','Nhân sự'],['score_sales','Kinh doanh'],['score_cskh','CSKH'],['score_repair','Sửa chữa'],['score_operation','Vận hành']].map(([k,l])=>`<div><label>${l}</label><input type="number" min="0" max="10" data-k="${k}" value="${esc(val(d,k,8))}"></div>`).join('')}</div></section>`,
  9:`<section class="card"><h2>10. Kế hoạch ngày mai</h2><label>3 việc ưu tiên + người làm + deadline</label><textarea data-k="tomorrow_priorities" rows="7">${esc(val(d,'tomorrow_priorities'))}</textarea><div class="grid3" style="margin-top:12px"><div><label>Target máy</label><input type="number" data-k="target_machines" value="${esc(val(d,'target_machines',0))}"></div><div><label>Target doanh thu</label><input type="number" data-k="target_revenue" value="${esc(val(d,'target_revenue',0))}"></div><div><label>Target follow</label><input type="number" data-k="target_follow" value="${esc(val(d,'target_follow',0))}"></div></div>
      <label style="margin-top:12px">Đề xuất lên CEO</label><textarea data-k="manager_proposal" rows="4">${esc(val(d,'manager_proposal'))}</textarea></section>`
 };
 const isSubmitted = String(d.status||'').toUpperCase()==='SUBMITTED';
 p.innerHTML = fields[i] + `<div class="bottom-submit"><div><span class="muted">${isSubmitted?'Báo cáo đã nộp. Mọi lần lưu tiếp theo vẫn giữ trạng thái ĐÃ NỘP.':'Lưu nháp bất kỳ lúc nào. Nộp xong CEO mới chấm/đánh giá.'}</span></div><div><button type="button" class="ghost" id="saveDraftBtn">${isSubmitted?'Lưu cập nhật':'Lưu nháp'}</button> <button type="button" class="primary" id="submitBtn">${isSubmitted?'Nộp cập nhật lên CEO':'Nộp báo cáo'}</button></div></div>`;
 p.querySelectorAll('[data-k]').forEach(el=>{ const k=el.dataset.k; if(d[k]!=null && (el.tagName==='SELECT')) el.value=d[k]; el.addEventListener('change',()=>d[k]=el.value); el.addEventListener('input',()=>d[k]=el.value); });
 $('#saveDraftBtn').onclick=async()=>{
   try{
     const rs=await api('report.saveDraft',{report:d});
     d.status=rs.status||d.status||'DRAFT';
     toast(d.status==='SUBMITTED'?'✅ Đã lưu cập nhật — báo cáo vẫn ĐÃ NỘP':'Đã lưu nháp');
     await loadManager();
   }catch(e){toast('❌ '+e.message)}
 };
 $('#submitBtn').onclick=async()=>{
   try{
     const rs=await api('report.submit',{report:d});
     d.status=rs.status||'SUBMITTED';
     toast('✅ Đã NỘP báo cáo lên CEO');
     await loadManager();
   }catch(e){
     toast('❌ Chưa nộp được: '+e.message);
     alert('CHƯA NỘP ĐƯỢC BÁO CÁO\n\n'+e.message);
   }
 };
}

async function loadCEO(date){
 if(date!==undefined) ceoSelectedDate=String(date||'');
 $('#ceoApp').innerHTML='<div class="card">Đang tải CEO Dashboard...</div>';
 try{
   const d=await api('ceo.dashboard',{date:ceoSelectedDate||''});
   ceoSelectedDate=d.date||ceoSelectedDate||'';
   renderCEO(d);
 }catch(e){$('#ceoApp').innerHTML=`<div class="alert danger">${esc(e.message)}</div>`}
}
function renderCEO(d){
 ceoManagers = Array.isArray(d.managers) ? d.managers : [];
 const k=d.kpis||{}, branches=d.branches||[], issues=d.issues||[], tasks=d.tasks||[];
 $('#ceoApp').innerHTML=`
 <div class="toolbar"><div class="field"><label>KỲ BÁO CÁO</label><input id="ceoDateFilter" type="date" value="${esc(d.date)}" max="${esc(d.today||d.date)}"></div><div class="field"><label>PHẠM VI</label><input value="Toàn hệ thống" readonly></div><div class="ceo-date-actions"><button class="ghost" id="prevCEODate" type="button">← Ngày trước</button><button class="ghost" id="todayCEO" type="button">Hôm nay</button><button class="primary" id="refreshCEO" type="button">Xem ngày này</button></div></div>
 ${d.date!==d.today?`<div class="alert"><b>Đang xem báo cáo cũ:</b> ${esc(d.date)}. Số liệu bên dưới là dữ liệu của ngày đã chọn, không phải hôm nay.</div>`:''}
 <div class="kpis">
  ${[['DOANH THU',money(k.revenue)],['ĐẠT TARGET',(k.targetRate||0)+'%'],['MÁY BÁN',k.machines||0],['TỶ LỆ CHỐT',(k.conversion||0)+'%'],['CHI PHÍ',money(k.cost)],['GIẢI NGÂN TREO',money(k.financePending)],['VẤN ĐỀ CEO',k.ceoIssues||0],['QL ĐÃ NỘP',`${k.submittedManagers||0}/${k.totalManagers||0}`]].map(([l,v])=>`<div class="kpi"><small>${l}</small><b>${v}</b></div>`).join('')}
 </div>
 <div class="tabs"><button class="ctab active" data-id="overview">CEO Overview</button><button class="ctab" data-id="managers">Hiệu quả QL</button><button class="ctab" data-id="issues">Vấn đề & quyết định</button><button class="ctab" data-id="tasks">CEO giao việc</button></div>
 <div class="layout"><main>
  <section id="overview" class="cpane">${branches.map(b=>`<div class="card"><div class="branchhead"><h2>${esc(b.branch)}</h2><span class="badge ${b.status==='SUBMITTED'?'bgreen':'borange'}">${b.status==='SUBMITTED'?'ĐÃ NỘP':'CHƯA NỘP'}</span></div><div class="summary"><div class="mini"><small>Doanh thu</small><b>${money(b.revenue)}</b></div><div class="mini"><small>Máy bán</small><b>${b.machines}</b></div><div class="mini"><small>Tỷ lệ chốt</small><b>${b.conversion}%</b></div><div class="mini"><small>Giải ngân treo</small><b>${money(b.financePending)}</b></div></div><p class="muted">${esc(b.managerProposal||'Không có đề xuất')}</p>${b.reportId?`<button class="ghost viewReportBtn" data-id="${b.reportId}">Xem báo cáo gốc QL</button>`:''}</div>`).join('')}
  </section>
  <section id="managers" class="cpane hidden card"><h2>Hiệu quả QL</h2><div class="table-wrap"><table><tr><th>QL</th><th>CN</th><th>Kinh doanh</th><th>Vận hành</th><th>Nhân sự</th><th>CSKH</th><th>Sửa chữa</th><th>Điểm CEO</th></tr>${(d.managers||[]).map(m=>`<tr><td>${esc(m.fullName)}</td><td>${esc(m.branch)}</td><td>${m.selfSales}</td><td>${m.selfOperation}</td><td>${m.selfStaff}</td><td>${m.selfCskh}</td><td>${m.selfRepair}</td><td>${m.ceoScore??'-'}</td></tr>`).join('')}</table></div></section>
  <section id="issues" class="cpane hidden card"><h2>Vấn đề & quyết định CEO</h2>${issues.length?issues.map(x=>`<div class="decision ${x.level==='MEDIUM'?'orangeborder':''}"><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p><span class="badge ${x.requiresCEO?'bred':'bgreen'}">${x.requiresCEO?'CEO CẦN XỬ LÝ':'QL ĐANG XỬ LÝ'}</span>${x.requiresCEO?` <button class="primary createTaskFromIssue" data-title="${esc(x.title)}" data-branch="${esc(x.branch)}">Giao việc</button>`:''}</div>`).join(''):'<div class="alert ok">Không có vấn đề nổi bật.</div>'}</section>
  <section id="tasks" class="cpane hidden card"><h2>CEO giao việc</h2><div class="table-wrap"><table><tr><th>Công việc</th><th>Chi nhánh</th><th>Người nhận</th><th>Deadline</th><th>Trạng thái</th></tr>${tasks.map(t=>`<tr><td>${esc(t.title)}</td><td>${esc(t.branch)}</td><td>${esc(t.assignedToName)}</td><td>${esc(t.dueDate)}</td><td>${esc(t.status)}</td></tr>`).join('')}</table></div><button id="newTaskBtn" class="primary" style="margin-top:12px">+ Giao việc mới</button></section>
 </main><aside class="side">
   <div class="card"><h2>CEO Attention</h2>${issues.filter(x=>x.requiresCEO).slice(0,4).map(x=>`<div class="task"><span class="badge bred">CẦN QUYẾT ĐỊNH</span><b style="display:block;margin-top:6px">${esc(x.title)}</b><p class="muted">${esc(x.description)}</p></div>`).join('')||'<div class="alert ok">Không có việc cần CEO quyết định.</div>'}</div>
   <div class="card"><h2>Đánh giá nhanh QL</h2><label>QL</label><select id="evalManager">${(d.managers||[]).map(m=>`<option value="${m.userId}">${esc(m.fullName)} · ${esc(m.branch)}</option>`).join('')}</select><label style="margin-top:10px">Điểm CEO</label><input id="evalScore" type="number" min="0" max="10" step="0.1"><label style="margin-top:10px">Nhận xét</label><textarea id="evalComment" rows="4"></textarea><button id="saveEval" class="dark full" style="margin-top:10px">Lưu đánh giá</button></div>
 </aside></div>`;
 $('#refreshCEO').onclick=()=>loadCEO($('#ceoDateFilter').value);
 $('#ceoDateFilter').onchange=()=>loadCEO($('#ceoDateFilter').value);
 $('#todayCEO').onclick=()=>loadCEO(d.today||'');
 $('#prevCEODate').onclick=()=>{
   const base=new Date((d.date||d.today)+'T00:00:00');
   base.setDate(base.getDate()-1);
   loadCEO(base.toISOString().slice(0,10));
 };
 document.querySelectorAll('.ctab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.ctab').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.cpane').forEach(x=>x.classList.add('hidden'));$('#'+b.dataset.id).classList.remove('hidden')});
 document.querySelectorAll('.viewReportBtn').forEach(b=>b.onclick=()=>openReport(b.dataset.id));
 document.querySelectorAll('.createTaskFromIssue').forEach(b=>b.onclick=()=>createTaskPrompt(b.dataset.title,b.dataset.branch));
 $('#newTaskBtn').onclick=()=>createTaskPrompt('', '');
 $('#saveEval').onclick=async()=>{try{await api('evaluation.save',{reportDate:d.date,managerUserId:$('#evalManager').value,score:Number($('#evalScore').value),comment:$('#evalComment').value});toast('Đã lưu đánh giá CEO');loadCEO()}catch(e){toast(e.message)}};
}

async function openReport(id){
 try{
   const r=await api('ceo.reportDetail',{reportId:id});
   alert(`BÁO CÁO ${r.branch} - ${r.reportDate}\nQL: ${r.managerName}\nDoanh thu: ${money(r.actual_revenue)}\nMáy bán: ${r.machines_sold}\nKhách đến: ${r.customer_total}\nKhách chưa mua: ${r.customer_failed}\n\nĐề xuất QL:\n${r.manager_proposal||'Không có'}`);
 }catch(e){toast(e.message)}
}
function createTaskPrompt(defaultTitle, branch){
  if(!ceoManagers.length){
    toast('Không có QL cửa hàng đang hoạt động để giao việc');
    return;
  }

  const old = document.querySelector('.task-modal-backdrop');
  if(old) old.remove();

  const preferred = ceoManagers.find(m => String(m.branch||'').trim().toLowerCase() === String(branch||'').trim().toLowerCase()) || ceoManagers[0];
  const wrap = document.createElement('div');
  wrap.className = 'task-modal-backdrop';
  wrap.innerHTML = `
    <div class="task-modal">
      <div class="task-modal-head">
        <div><div class="brand">POPOPHONE · CEO</div><h2>Giao việc cho QL cửa hàng</h2></div>
        <button type="button" class="ghost taskModalClose">Đóng</button>
      </div>
      <div class="grid2">
        <div><label>QL NHẬN VIỆC</label><select id="taskAssignee">${ceoManagers.map(m=>`<option value="${esc(m.userId)}" ${String(m.userId)===String(preferred.userId)?'selected':''}>${esc(m.fullName)} · ${esc(m.branch)}</option>`).join('')}</select></div>
        <div><label>ƯU TIÊN</label><select id="taskPriority"><option value="HIGH">Cao</option><option value="MEDIUM">Vừa</option><option value="LOW">Thấp</option></select></div>
      </div>
      <div style="margin-top:12px"><label>NỘI DUNG CÔNG VIỆC</label><input id="taskTitle" value="${esc(defaultTitle||'')}" placeholder="Ví dụ: Kiểm tra lệch phụ kiện và báo kết quả"></div>
      <div style="margin-top:12px"><label>DEADLINE</label><input id="taskDue" type="datetime-local"></div>
      <div style="margin-top:12px"><label>YÊU CẦU / KẾT QUẢ MONG MUỐN</label><textarea id="taskDesc" rows="4">Cập nhật kết quả xử lý vào hệ thống.</textarea></div>
      <div class="task-modal-actions"><button type="button" class="ghost taskModalClose">Huỷ</button><button type="button" class="primary" id="taskSubmitBtn">Giao việc</button></div>
    </div>`;
  document.body.appendChild(wrap);

  wrap.querySelectorAll('.taskModalClose').forEach(b=>b.onclick=()=>wrap.remove());
  wrap.onclick=e=>{ if(e.target===wrap) wrap.remove(); };
  const titleEl = wrap.querySelector('#taskTitle');
  setTimeout(()=>titleEl.focus(),0);

  wrap.querySelector('#taskSubmitBtn').onclick = async()=>{
    const assignedToUserId = wrap.querySelector('#taskAssignee').value;
    const manager = ceoManagers.find(m=>String(m.userId)===String(assignedToUserId));
    const title = titleEl.value.trim();
    const dueRaw = wrap.querySelector('#taskDue').value;
    const dueDate = dueRaw ? dueRaw.replace('T',' ') : '';
    const description = wrap.querySelector('#taskDesc').value.trim();
    const priority = wrap.querySelector('#taskPriority').value;
    if(!assignedToUserId){ toast('Chọn QL nhận việc'); return; }
    if(!title){ toast('Nhập nội dung công việc'); return; }
    const btn = wrap.querySelector('#taskSubmitBtn');
    btn.disabled = true; btn.textContent = 'Đang giao...';
    try{
      await api('task.create',{assignedToUserId,branch:manager?.branch||'',title,description,dueDate,priority});
      wrap.remove();
      toast('Đã giao việc cho '+(manager?.fullName||'QL'));
      loadCEO();
    }catch(e){
      btn.disabled=false; btn.textContent='Giao việc';
      toast(e.message);
    }
  };
}

$('#loginBtn').onclick=login;
$('#loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('#logoutBtn').onclick=logout;
restore();