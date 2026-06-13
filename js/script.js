// ==============================
// ตัวแปรหลัก
// ==============================
// ⚠️ นำ URL ของ Web App ที่เพิ่ง Deploy ใหม่มาวางตรงนี้
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbx5R3HaXBNjOLzQb-Wdo69gNJnQYh0eux5ONsJKSbCHlIuafdbRijGxkjSgQx4EKXYezw/exec"; 

var summaryData = []; 
var projects = []; 
var latestTransactions = []; 
var isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'; 
var fullName = localStorage.getItem('fullName') || ''; 
var userRole = localStorage.getItem('userRole') || ''; 
var authToken = localStorage.getItem('authToken') || ''; 

var assignableUsers = []; 
var tomSelectOwner = null; 
var budgetChartInstance = null; 

var uploadModal = null;
var currentUploadTxId = null; 
var uploadMode = 'read';      
var stagedUploads = [];   
var stagedDeletions = []; 

// ==============================
// 🚀 ฟังก์ชันผู้ช่วยสำหรับคุยกับ API (ตัวแทน google.script.run)
// ==============================
function callAPI(action, params = {}) {
  params.action = action;
  return fetch(WEB_APP_URL, {
    method: 'POST',
    body: JSON.stringify(params),
    headers: {
      "Content-Type": "text/plain;charset=utf-8" // สำคัญ: เลี่ยงปัญหา CORS Blocked
    }
  })
  .then(response => {
    if (!response.ok) throw new Error("Network response was not ok");
    return response.json();
  });
}

function getUserFullName(userId) {
  if (!userId) return '(ไม่ได้ระบุ)';
  const user = assignableUsers.find(function(u) { return u.id === userId; });
  return user ? user.fullName : '(ไม่พบชื่อ)';
}

function _parseOwnerIds(ownerData) {
  if (!ownerData) return []; 
  if (typeof ownerData === 'string' && ownerData.startsWith('[')) {
    try {
      const ids = JSON.parse(ownerData);
      return Array.isArray(ids) ? ids : [];
    } catch (e) {
      return [];
    }
  }
  if (typeof ownerData === 'string' && ownerData.length > 0) {
    return [ownerData];
  }
  return [];
}

function loadAssignableUsers() {
  if (userRole !== 'Admin' && userRole !== 'Staff') return; 
  callAPI('getAssignableUsersList', { token: authToken })
    .then(function(users) { assignableUsers = users; })
    .catch(onFailure);
}

function onFailure(error) {
  loadingEnd(); 
  console.error('API Server Error:', error); 

  let errorName = "Error";
  let errorMessage = String(error.message || "การเชื่อมต่อล้มเหลว หรือ Server ไม่ตอบสนอง");

  let errorText = '[' + errorName + '] ' + errorMessage + '. กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ';

  if (errorMessage.includes("Invalid or expired token")) {
    errorText = "เซสชันหมดอายุ กรุณาล็อกอินใหม่อีกครั้ง";
    forceLogout(); 
  }
  
  if (errorMessage.includes("HTTP 429") || errorMessage.includes("Too Many Requests")) {
      errorName = "TooManyRequests"; 
      errorText = "ขณะนี้ Server กำลังประมวลผลคำขอจำนวนมาก (HTTP 429) กรุณารอสักครู่ (ประมาณ 1-2 นาที) แล้วลองใหม่อีกครั้ง";
  }

  Swal.fire({
    icon: 'error',
    title: 'เกิดข้อผิดพลาด (' + errorName + ')',
    text: errorText
  });
}

function forceLogout() {
  isLoggedIn = false;
  fullName = '';
  userRole = '';
  authToken = ''; 
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('fullName');
  localStorage.removeItem('userRole');
  localStorage.removeItem('authToken'); 
  window.location.reload(); // รีโหลดหน้าเว็บเพื่อให้ GitHub ล้างสถานะ
}

// ==============================
// ฟังก์ชันเมื่อโหลดหน้าเว็บเสร็จ
// ==============================
document.addEventListener('DOMContentLoaded', function() { 
  toastr.options = {
    "positionClass": "toast-bottom-right",
    "timeOut": "3000",
    "progressBar": true
  };

  updateNavbar(); 
  loadProjectSummary(); 

  if (isLoggedIn) {
    loadProjects();
    showSection('public'); 
  } else {
    showSection('public'); 
  }

  if (document.getElementById('modalUploadFiles')) {
    uploadModal = new bootstrap.Modal(document.getElementById('modalUploadFiles'));
    setupDropzones(); 
    
    document.getElementById('btnUploadEdit').addEventListener('click', function() {
      setUploadMode('edit');
    });
    document.getElementById('btnUploadCancel').addEventListener('click', function() {
      cancelUploadChanges();
    });
    document.getElementById('btnUploadSave').addEventListener('click', function() {
      saveFileChangesClient();
    });
  }

  // ล็อกอินเข้าระบบ
  document.getElementById('loginForm').addEventListener('submit', function(e) { 
    e.preventDefault(); 

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!username || !password) {
      Swal.fire('ผิดพลาด', 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 'error');
      return;
    }

    loadingStart(); 
    callAPI('authenticateUser', { username: username, password: password })
      .then(function(response) { 
        loadingEnd(); 

        if (response.success) {
          isLoggedIn = true;
          fullName = response.fullName;
          userRole = response.role;
          authToken = response.token; 
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('fullName', fullName);
          localStorage.setItem('userRole', userRole);
          localStorage.setItem('authToken', authToken); 

          updateNavbar(); 
          showSection('public');
          loadProjectSummary(); 
          loadProjects(); 
          loadDataTransactions(); 
          Swal.fire('สำเร็จ', response.message, 'success');

          bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
        } else {
          Swal.fire('ผิดพลาด', response.message, 'error');
        }
      })
      .catch(onFailure);
  });
});

function showSection(sectionId) {
  if (sectionId === 'admin' && !isLoggedIn) {
    Swal.fire('กรุณาล็อกอิน', 'คุณต้องล็อกอินเพื่อใช้งานส่วนดำเนินการ', 'warning');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('loginModal')).show();
    return;
  }

  document.querySelectorAll('.section').forEach(function(section) { 
     section.classList.remove('active');
  });

  const el = document.getElementById(sectionId);
  if (el) {
    el.classList.add('active');
  }
  window.scrollTo(0, 0);

  document.querySelectorAll('#navLinks .nav-link').forEach(function(link) { 
    link.classList.remove('active');
    if (link.getAttribute('href') === '#' + sectionId) { 
      link.classList.add('active');
    }
  });
}

function updateNavbar() {
  const navLinks = document.getElementById('navLinks');
  const userInfo = document.getElementById('userInfo');
  const logoutBtn = document.getElementById('logoutBtn');

  const navProjectTab = document.getElementById('nav-project-tab');
  const navUserTab = document.getElementById('nav-user-tab');
  const btnAddProject = document.getElementById('btn-add-project');
  const btnAddUser = document.getElementById('btn-add-user');
  const formTransaction = document.getElementById('form-transaction');
  const navSettingTab = document.getElementById('nav-setting-tab'); 
  
  const btnTemplateProject = document.getElementById('btn-template-project');
  const btnExportProject = document.getElementById('btn-export-project');
  const btnImportProject = document.getElementById('btn-import-project');

  if (isLoggedIn) {
    userInfo.textContent = 'สวัสดี, ' + fullName + ' (' + userRole + ')'; 
    logoutBtn.style.display = 'inline-block';
    
    navLinks.innerHTML =
        '<li class="nav-item"><a class="nav-link" href="#admin" onclick="showSection(\'admin\')"><i class="fa-solid fa-user-shield me-1"></i> ดำเนินการ</a></li>' +
        '<li class="nav-item"><a class="nav-link" href="#public" onclick="showSection(\'public\')"><i class="fa-solid fa-chart-line me-1"></i> ข้อมูลทั่วไป</a></li>'; 
    navLinks.classList.add('me-auto');
    navLinks.classList.remove('ms-auto');

    if (userRole === 'Admin') {
      if (navProjectTab) navProjectTab.classList.remove('d-none');
      if (navUserTab) navUserTab.classList.remove('d-none');
      if (navSettingTab) navSettingTab.classList.remove('d-none'); 
      if (btnAddProject) btnAddProject.classList.remove('d-none');
      if (btnAddUser) btnAddUser.classList.remove('d-none');
      if (formTransaction) formTransaction.classList.remove('d-none');
      if (btnTemplateProject) btnTemplateProject.classList.remove('d-none');
      if (btnExportProject) btnExportProject.classList.remove('d-none');
      if (btnImportProject) btnImportProject.classList.remove('d-none');
      if (assignableUsers.length === 0) loadAssignableUsers();

    } else if (userRole === 'Staff') {
      if (navProjectTab) navProjectTab.classList.add('d-none');
      if (navUserTab) navUserTab.classList.add('d-none');
      if (navSettingTab) navSettingTab.classList.add('d-none'); 
      if (btnAddProject) btnAddProject.classList.add('d-none');
      if (btnAddUser) btnAddUser.classList.add('d-none');
      if (formTransaction) formTransaction.classList.remove('d-none'); 
      if (btnTemplateProject) btnTemplateProject.classList.add('d-none');
      if (btnExportProject) btnExportProject.classList.add('d-none');
      if (btnImportProject) btnImportProject.classList.add('d-none');
      if (assignableUsers.length === 0) loadAssignableUsers();
      
    } else { 
      if (navProjectTab) navProjectTab.classList.add('d-none');
      if (navUserTab) navUserTab.classList.add('d-none');
      if (navSettingTab) navSettingTab.classList.add('d-none'); 
      if (btnAddProject) btnAddProject.classList.add('d-none');
      if (btnAddUser) btnAddUser.classList.add('d-none');
      if (formTransaction) formTransaction.classList.add('d-none'); 
      if (btnTemplateProject) btnTemplateProject.classList.add('d-none');
      if (btnExportProject) btnExportProject.classList.add('d-none');
      if (btnImportProject) btnImportProject.classList.add('d-none');
    }

  } else {
    userInfo.textContent = '';
    logoutBtn.style.display = 'none';
    navLinks.innerHTML = '<li class="nav-item"><a class="nav-link" href="#" data-bs-toggle="modal" data-bs-target="#loginModal"><i class="fa-solid fa-right-to-bracket me-1"></i> เข้าสู่ระบบ</a></li>'; 
    navLinks.classList.add('ms-auto');
    navLinks.classList.remove('me-auto');

    if (navProjectTab) navProjectTab.classList.add('d-none');
    if (navUserTab) navUserTab.classList.add('d-none');
    if (navSettingTab) navSettingTab.classList.add('d-none'); 
    if (btnAddProject) btnAddProject.classList.add('d-none');
    if (btnAddUser) btnAddUser.classList.add('d-none');
    if (formTransaction) formTransaction.classList.add('d-none');
    if (btnTemplateProject) btnTemplateProject.classList.add('d-none');
    if (btnExportProject) btnExportProject.classList.add('d-none');
    if (btnImportProject) btnImportProject.classList.add('d-none');
    assignableUsers = []; 
  }
}

document.getElementById('logoutBtn').addEventListener('click', function() { 
  Swal.fire({
    title: 'ยืนยันการล็อกเอาท์',
    text: 'คุณต้องการออกจากระบบใช่หรือไม่?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'ล็อกเอาท์',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: 'var(--danger-color)'
  }).then(function(result) { 
    if (result.isConfirmed) {
      forceLogout(); // เรียกใช้ฟังก์ชันล้างค่าและรีโหลดหน้า
    }
  });
});

function loadProjects() {
  if (!isLoggedIn) return;
  loadingStart();
  
  callAPI('getProjects', { token: authToken })
    .then(function(data) { 
      loadingEnd();
      projects = data; 
      const select = document.getElementById('project');
      if (!select) return; 

      select.innerHTML = '<option value="">-- กรุณาเลือก --</option>';
      data.forEach(function(project) { 
        const option = document.createElement('option');
        option.value = project.code;
        option.textContent = project.code + ' - ' + project.name; 
        select.appendChild(option);
      });
      onProjectChange();
    })
    .catch(onFailure);
}

function onProjectChange() {
  const code = document.getElementById('project').value;
  const project = projects.find(function(p) { return p.code === code; }); 
  const projectData = summaryData.find(function(p) { return p.code === code; });

  const infoDiv = document.getElementById('projectInfo');
  if (!infoDiv) return;

  const amountInput = document.getElementById('amount');
  const amountLabel = document.getElementById('labelAmount');
  const submitButton = document.getElementById('btnSubmitTransaction');

  const infoName = document.getElementById('infoName');
  const infoBudget = document.getElementById('infoBudget');
  const infoOwner = document.getElementById('infoOwner');
  const balanceAmount = document.getElementById('balanceAmount');
  const sequenceCount = document.getElementById('sequenceCount');

  if (project) {
    infoDiv.classList.remove('d-none');
    infoName.textContent = project.name;
    const budget = parseFloat(project.budget) || 0; 
    infoBudget.textContent = budget.toLocaleString() + " บาท";
    
    const ownerIds = _parseOwnerIds(project.owner);
    const ownerNames = ownerIds.map(getUserFullName).join(', ');
    infoOwner.textContent = ownerNames || '(ไม่ได้ระบุ)';

    if (projectData) {
      balanceAmount.textContent = Number(projectData.balance).toLocaleString() + " บาท";
      sequenceCount.textContent = projectData.txCount || "0";
    } else {
      balanceAmount.textContent = budget.toLocaleString() + " บาท";
      sequenceCount.textContent = "0";
    }
    
    if (budget === 0) {
      amountInput.value = 0;
      amountInput.disabled = true;
      amountLabel.innerHTML = '<i class="fa-solid fa-file-lines me-1 text-info"></i> บันทึกรายงาน (ไม่ใช้งบประมาณ)';
      submitButton.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i> บันทึกรายงาน';
      submitButton.classList.remove('btn-primary');
      submitButton.classList.add('btn-info');
    } else {
      amountInput.value = ''; 
      amountInput.disabled = false;
      amountInput.placeholder = 'ระบุจำนวนเงินที่ต้องการเบิก';
      amountLabel.innerHTML = '<i class="fa-solid fa-money-bill-wave me-1 text-success"></i> จำนวนเงินที่ต้องการเบิก';
      submitButton.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i> บันทึกการเบิกเงิน';
      submitButton.classList.add('btn-primary');
      submitButton.classList.remove('btn-info');
    }

  } else {
    infoDiv.classList.add('d-none');
    infoName.textContent = "-";
    infoBudget.textContent = "-";
    infoOwner.textContent = "-";
    balanceAmount.textContent = "-";
    sequenceCount.textContent = "-";
    
    amountInput.value = '';
    amountInput.disabled = false;
    amountInput.placeholder = 'ระบุจำนวนเงินที่ต้องการเบิก';
    amountLabel.innerHTML = '<i class="fa-solid fa-money-bill-wave me-1 text-success"></i> จำนวนเงินที่ต้องการเบิก';
    submitButton.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i> บันทึกการเบิกเงิน';
    submitButton.classList.add('btn-primary');
    submitButton.classList.remove('btn-info');
  }
}

function submitTransaction() {
  if (userRole === 'Viewer') {
    toastr.error("⚠️ คุณไม่มีสิทธิ์ในการเบิกเงิน");
    return;
  }
  if (!requireLogin()) return;

  const projectCode = document.getElementById('project').value;
  const amountInput = document.getElementById('amount');
  const amount = parseFloat(amountInput.value);

  if (!projectCode) {
    toastr.error("⚠️ กรุณาเลือกโครงการก่อนทำรายการ");
    return;
  }
  
  if (amount === null || amount === undefined || amount < 0) {
    toastr.error("⚠️ กรุณากรอกจำนวนเงินที่ถูกต้อง");
    return;
  }

  const project = projects.find(function(p) { return p.code === projectCode; }); 
  const projectName = project ? project.name : '(ไม่ทราบชื่อโครงการ)';
  const budget = parseFloat(project.budget) || 0;

  let swalTitle = 'ยืนยันการเบิกเงิน';
  let swalHtml =
      '<p><i class="fa-solid fa-diagram-project text-primary me-1"></i> โครงการ: <strong>' + projectName + '</strong></p>' +
      '<p><i class="fa-solid fa-coins text-warning me-1"></i> จำนวนเงิน: <strong>' + amount.toLocaleString() + '</strong> บาท</p>';
  
  if (budget === 0 && amount === 0) {
    swalTitle = 'ยืนยันการบันทึกรายงาน';
    swalHtml =
        '<p><i class="fa-solid fa-diagram-project text-primary me-1"></i> โครงการ: <strong>' + projectName + '</strong></p>' +
        '<p class="text-info"><i class="fa-solid fa-file-lines me-1"></i> บันทึกรายงานนี้ (ไม่ใช้งบประมาณ)</p>';
  }

  Swal.fire({
    title: swalTitle,
    html: swalHtml,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'ใช่,ยืนยัน',
    confirmButtonColor: 'var(--success-color)'
  }).then(function(result) { 
    if (result.isConfirmed) {
      loadingStart();
      callAPI('submitTransaction', { token: authToken, projectCode: projectCode, amount: amount })
        .then(function(response) { 
          loadingEnd();
          if (response.success) {
            let successTitle = amount === 0 ? 'บันทึกรายงานสำเร็จ!' : 'สำเร็จ!';
            let successHtml = amount === 0 ? 'ระบบได้สร้างรายการสำหรับแนบไฟล์แล้ว (ยอด 0 บาท)' : response.message + '<br>✅ ครั้งที่เบิก: ' + response.sequence + '<br>💰 ยอดคงเหลือ: ' + Number(response.balance).toLocaleString() + ' บาท';
            
            Swal.fire({ icon: 'success', title: successTitle, html: successHtml });
            onProjectChange(); 
            loadDataTransactions(); 
            loadProjectSummary(); 
          } else {
            Swal.fire('เกิดข้อผิดพลาด!', response.message, 'error');
          }
        })
        .catch(onFailure);
    }
  });
}

function requireLogin() {
  if (!isLoggedIn || !authToken) { 
    Swal.fire('กรุณาล็อกอิน', 'คุณต้องล็อกอินเพื่อใช้งานส่วนดำเนินการ', 'warning');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('loginModal')).show();
    return false;
  }
  return true;
}

function loadDataTransactions() {
  if (!requireLogin()) return; 

  loadingStart();
  callAPI('getDataTransactions', { token: authToken })
    .then(function(data) { 
      loadingEnd();
      latestTransactions = data; 
      showTableTransactions(data); 
    })
    .catch(onFailure);
}

function showTableTransactions(items) {
  const tableId = '#tableTransactions';
  if ($.fn.DataTable.isDataTable(tableId)) $(tableId).DataTable().destroy();

  if (!items || items.length === 0) {
    $(tableId).html("<thead><tr><th>#</th><th>โครงการ</th><th>จำนวนเงิน</th><th>ครั้งที่</th><th>คงเหลือ</th><th>Action</th></tr></thead><tbody><tr><td colspan='6' class='text-center'>ไม่พบข้อมูล</td></tr></tbody>");
    return;
  }

  new DataTable(tableId, {
    destroy: true, responsive: true, pageLength: 10, data: items, order: [[4, 'desc']],
    columns: [
      { title: "#", data: null, render: function(data, type, row, meta) { return meta.row + 1; }, className: 'text-center' },
      { title: "รหัส/โครงการ", data: null, render: function(data, type, row) { return row[1] + ' ' + row[2]; } },
      { title: "จำนวนเงินที่เบิก", data: 3, render: function(data) { return Number(data).toLocaleString(); }, className: 'text-end' },
      { title: "ครั้งที่เบิก", data: 5, className: 'text-center' },
      { title: "เงินคงเหลือ", data: 6, render: function(data) { return Number(data).toLocaleString(); }, className: 'text-end' },
      { title: "Action", data: 0, orderable: false, className: 'text-center',
        render: function(data, type, row) { 
          const hasAttachments = (row[7] && row[7] !== "[]") || (row[8] && row[8] !== "[]");
          let editBtn = '<button class="btn btn-sm btn-warning" onclick="editTransactions(\'' + data + '\')" title="แก้ไข"><i class="fas fa-pen"></i></button>';
          let deleteBtn = '<button class="btn btn-sm btn-danger ms-1" onclick="deleteTransactions(\'' + data + '\')" title="ลบ"><i class="fas fa-trash"></i></button>';
          let uploadBtn = '<button class="btn btn-sm ' + (hasAttachments ? 'btn-success' : 'btn-info') + ' ms-1" onclick="openUploadModal(\'' + data + '\')" title="แนบไฟล์"><i class="fas fa-paperclip"></i></button>';

          if (userRole === 'Admin') return editBtn + deleteBtn + uploadBtn;
          if (userRole === 'Staff') return editBtn + uploadBtn; 
          return 'N/A'; 
        }
      }
    ],
    pagingType: 'simple_numbers',
    language: { url: 'https://cdn.datatables.net/plug-ins/1.11.3/i18n/th.json' }
  });
}

function deleteTransactions(txId) {
  if (userRole !== 'Admin') { toastr.error("⚠️ คุณไม่มีสิทธิ์ลบรายการ"); return; }
  if (!requireLogin()) return;

  const transaction = latestTransactions.find(function(tx) { return tx[0] === txId; }); 
  const projectCode = transaction ? transaction[1] : '';
  const projectName = transaction ? transaction[2] : '(ไม่ทราบชื่อโครงการ)';

  Swal.fire({
    title: 'ลบรายการ',
    html: '<p><strong>โครงการ:</strong> ' + projectName + ' (' + projectCode + ')</p><p><strong>ID:</strong> ' + txId + '</p><p class="text-danger">การดำเนินการนี้จะลบไฟล์แนบทั้งหมด และคำนวณยอดคงเหลือใหม่</p>',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ใช่,ลบ',
    confirmButtonColor: 'var(--danger-color)'
  }).then(function(result) { 
    if (result.isConfirmed) {
      loadingStart();
      callAPI('deleteTransactionById', { token: authToken, txId: txId })
        .then(function(resp) { 
          loadingEnd();
          if (resp.success) {
            Swal.fire('ลบเสร็จสิ้น', 'รายการถูกลบเรียบร้อยแล้ว', 'success');
            loadProjectSummary(); 
            loadDataTransactions(); 
          } else {
            Swal.fire('ผิดพลาด', resp.message, 'error');
          }
        })
        .catch(onFailure);
    }
  });
}

function editTransactions(txId) {
  if (userRole !== 'Admin' && userRole !== 'Staff') { toastr.error("⚠️ คุณไม่มีสิทธิ์แก้ไขรายการ"); return; }
  if (!requireLogin()) return;

  loadingStart();
  callAPI('getTransactionById', { token: authToken, txId: txId })
    .then(function(tx) { 
      loadingEnd();
      if (!tx) { Swal.fire('ผิดพลาด', 'ไม่พบรายการที่จะแก้ไข', 'error'); return; }

      const hasAttachments = (tx.receipts && tx.receipts !== "[]") || (tx.reports && tx.reports !== "[]");
      const isZeroAmountTx = parseFloat(tx.amount) === 0;

      Swal.fire({
        title: 'แก้ไขรายการ',
        html: '<p><strong>ID:</strong> ' + tx.id + '</p><p><strong>โครงการ:</strong> ' + tx.projectCode + ' ' + tx.projectName + '</p><input type="number" id="swal-input-amount" class="swal2-input" value="' + tx.amount + '" placeholder="จำนวนเงิน" ' + (hasAttachments || isZeroAmountTx ? 'disabled' : '') + '>' +
              (hasAttachments ? '<small class="text-danger d-block mt-2">ไม่สามารถแก้ไขยอดเงินได้หลังจากแนบไฟล์แล้ว</small>' : '') +
              (isZeroAmountTx && !hasAttachments ? '<small class="text-info d-block mt-2">ไม่สามารถแก้ไขยอดเงินของรายการที่บันทึกแบบ 0 บาทได้</small>' : ''),
        showCancelButton: true,
        confirmButtonText: 'บันทึก',
        preConfirm: function() { 
          if (hasAttachments || isZeroAmountTx) return parseFloat(tx.amount);
          const newAmt = parseFloat(document.getElementById('swal-input-amount').value);
          if (newAmt === null || newAmt === undefined || newAmt < 0 || newAmt === 0) {
               Swal.showValidationMessage('กรุณากรอกจำนวนเงินที่ถูกต้อง และต้องไม่เป็น 0');
               return false; 
          }
          return newAmt;
        }
      }).then(function(res) { 
        if (res.isConfirmed && res.value !== undefined) {
          if (res.value === parseFloat(tx.amount)) { toastr.info("ไม่มีการเปลี่ยนแปลงยอดเงิน"); return; }
          
          loadingStart();
          callAPI('updateTransaction', { token: authToken, id: tx.id, newAmount: res.value })
            .then(function(resp) { 
              loadingEnd();
              if (resp.success) {
                Swal.fire('สำเร็จ', resp.message, 'success');
                loadProjectSummary(); 
                loadDataTransactions();
              } else {
                Swal.fire('ผิดพลาด', resp.message, 'error');
              }
            })
            .catch(onFailure);
        }
      });
    })
    .catch(onFailure);
}

function loadProjectSummary() {
  loadingStart();
  const tokenToSend = isLoggedIn ? authToken : null;

  callAPI('getProjectSummary', { token: tokenToSend })
    .then(function(res) { 
      loadingEnd();
      if (res.success) {
        summaryData = res.data; 

        const filterSelect = document.getElementById('filterProject');
        const currentProjectVal = filterSelect.value; 
        const filterStatusSelect = document.getElementById('filterStatus');
        const currentStatusVal = filterStatusSelect.value; 

        filterSelect.innerHTML = '<option value="">-- แสดงทั้งหมด --</option>';
        summaryData.forEach(function(item) { 
          const opt = document.createElement('option');
          opt.value = item.code;
          opt.textContent = item.code + ' - ' + item.name; 
          filterSelect.appendChild(opt);
        });
        
        filterSelect.value = currentProjectVal;
        filterStatusSelect.value = currentStatusVal;

        filterSummaryTable(); 
        onProjectChange();
        
        if (userRole === 'Admin') renderAdminDashboard(summaryData);

      } else {
        toastr.error("ไม่สามารถโหลดข้อมูลสรุปโครงการได้");
      }
    })
    .catch(onFailure);
}

function filterSummaryTable() {
  const selectedCode = document.getElementById('filterProject').value;
  const selectedStatus = document.getElementById('filterStatus').value;
  let filteredData = summaryData;

  if (selectedCode) filteredData = filteredData.filter(function(item) { return item.code === selectedCode; });
  if (selectedStatus) filteredData = filteredData.filter(function(item) { return item.status === selectedStatus; });

  renderSummaryTable(filteredData);
  renderSummaryDashboard(filteredData);
}

function getStatusBadge(status) {
  if (status === "เสร็จสิ้น") return '<span class="badge bg-success-subtle text-success-emphasis rounded-pill">' + status + '</span>';
  if (status === "กำลังดำเนินการ") return '<span class="badge bg-warning-subtle text-warning-emphasis rounded-pill">' + status + '</span>';
  return '<span class="badge bg-secondary-subtle text-secondary-emphasis rounded-pill">' + status + '</span>';
}

function renderSummaryTable(data) {
  const tableId = '#summaryTable';
  if ($.fn.DataTable.isDataTable(tableId)) $(tableId).DataTable().destroy();

  const tbody = document.querySelector(tableId + ' tbody'); 
  tbody.innerHTML = ''; 

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">ไม่พบข้อมูล</td></tr>'; 
    return;
  }

  data.forEach(function(item, index) { 
    const tr = document.createElement('tr');
    const reportRatio = item.txWithFiles + ' / ' + item.txCount;
    tr.innerHTML = '<td class="text-center">' + (index + 1) + '</td><td>' + item.code + ' - ' + item.name + '</td><td class="text-center">' + getStatusBadge(item.status) + '</td><td class="text-center">' + item.txCount + '</td><td class="text-center">' + (item.txCount > 0 ? reportRatio : '-') + '</td>';
    tbody.appendChild(tr);
  });

  new DataTable(tableId, { destroy: true, responsive: true, pageLength: 10, order: [[0, 'asc']] });
}

function renderSummaryDashboard(data) {
  const totalProjects = data.length;
  let totalCompleted = 0; let totalInProgress = 0; let totalNotStarted = 0;

  data.forEach(function(item) {
    if (item.status === "เสร็จสิ้น") totalCompleted++;
    else if (item.status === "กำลังดำเนินการ") totalInProgress++;
    else totalNotStarted++;
  });

  document.getElementById('totalProjects').textContent = totalProjects;
  document.getElementById('totalCompleted').textContent = totalCompleted;
  document.getElementById('totalInProgress').textContent = totalInProgress;
  document.getElementById('totalNotStarted').textContent = totalNotStarted;
}

function renderAdminDashboard(data) {
  const dashboardPanel = document.getElementById('admin-dashboard-panel');
  if (!dashboardPanel) return;
  if (userRole !== 'Admin') { dashboardPanel.classList.add('d-none'); return; }
  
  dashboardPanel.classList.remove('d-none');
  let totalBudget = 0; let totalUsed = 0;

  if (data && data.length > 0) {
    data.forEach(function(item) {
      totalBudget += parseFloat(item.budget) || 0;
      totalUsed += parseFloat(item.used) || 0;
    });
  }

  const totalBalance = totalBudget - totalUsed;
  const utilization = totalBudget > 0 ? (totalUsed / totalBudget) * 100 : 0;
  const fmt = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  document.getElementById('dash-total-budget').textContent = fmt.format(totalBudget);
  document.getElementById('dash-total-used').textContent = fmt.format(totalUsed);
  document.getElementById('dash-total-balance').textContent = fmt.format(totalBalance);
  document.getElementById('dash-utilization').textContent = utilization.toFixed(2);
  
  const progressBar = document.getElementById('dash-progress-bar');
  if (progressBar) {
      progressBar.style.width = Math.min(utilization, 100) + '%';
      progressBar.setAttribute('aria-valuenow', utilization);
  }

  const ctx = document.getElementById('budgetChart');
  if (!ctx) return;
  if (budgetChartInstance) budgetChartInstance.destroy(); 

  budgetChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['ใช้ไปแล้ว', 'คงเหลือ'],
      datasets: [{ data: [totalUsed, totalBalance], backgroundColor: ['#ffc107', '#198754'], borderWidth: 0, hoverOffset: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%', layout: { padding: 10 },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15, boxWidth: 8, font: { family: "'Kanit', sans-serif", size: 12 } } },
        tooltip: { callbacks: { label: function(context) { let label = context.label ? context.label + ': ' : ''; return label + fmt.format(context.parsed) + ' บาท'; } } }
      }
    }
  });
}

function setUploadMode(mode) {
  uploadMode = mode;
  const modalBody = document.querySelector('#modalUploadFiles .upload-modal-body');
  if (!modalBody) return;
  
  modalBody.dataset.mode = mode; 
  if (mode === 'edit') {
    document.getElementById('upload-footer-readonly').classList.add('d-none');
    document.getElementById('upload-footer-edit').classList.remove('d-none');
  } else { 
    document.getElementById('upload-footer-readonly').classList.remove('d-none');
    document.getElementById('upload-footer-edit').classList.add('d-none');
  }
}

function openUploadModal(txId) {
  if (!requireLogin()) return;
  
  currentUploadTxId = txId; 
  setUploadMode('read');
  stagedUploads = [];
  stagedDeletions = [];
  
  document.getElementById('uploadTxId').value = txId;
  document.getElementById('uploadTxIdDisplay').textContent = txId;
  document.getElementById('uploadTxProjectName').textContent = 'กำลังโหลด...';
  document.getElementById('preview-receipts').innerHTML = '';
  document.getElementById('preview-reports').innerHTML = '';

  uploadModal.show();
  loadingStart(); 

  callAPI('getTransactionById', { token: authToken, txId: txId })
    .then(function(tx) { 
      loadingEnd();
      if (!tx) { uploadModal.hide(); Swal.fire('ผิดพลาด', 'ไม่พบ Transaction', 'error'); return; }

      document.getElementById('uploadTxProjectName').textContent = tx.projectCode + ' - ' + tx.projectName; 

      if (tx.receipts) {
        try { JSON.parse(tx.receipts).forEach(function(id) { renderThumbnail(id, id, 'receipts', false, true, ''); }); } catch (e) { }
      }
      if (tx.reports) {
        try { JSON.parse(tx.reports).forEach(function(id) { renderThumbnail(id, id, 'reports', false, true, ''); }); } catch (e) { }
      }
    })
    .catch(onFailure);
}

function setupDropzones() {
  const dropzones = document.querySelectorAll('.dropzone');
  const fileUploader = document.getElementById('fileUploader');

  dropzones.forEach(function(zone) { 
    const fileType = zone.dataset.fileType;
    zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', function(e) { e.preventDefault(); zone.classList.remove('dragover'); });
    zone.addEventListener('drop', function(e) { 
      e.preventDefault(); zone.classList.remove('dragover');
      if (uploadMode === 'edit' && e.dataTransfer.files) processFiles(e.dataTransfer.files, fileType);
    });
    zone.addEventListener('click', function() { 
      if (uploadMode === 'edit') { fileUploader.dataset.fileType = fileType; fileUploader.click(); }
    });
  });

  fileUploader.addEventListener('change', function(e) { 
    if (uploadMode === 'edit' && e.target.files) processFiles(e.target.files, e.target.dataset.fileType);
    e.target.value = null; 
  });
}

function processFiles(files, fileType) {
  if (!files || files.length === 0) return;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
  for (const file of files) {
    if (!allowedTypes.includes(file.type)) { toastr.error('ไฟล์ ' + file.name + ' มีประเภทไม่ถูกต้อง', 'ไม่อนุญาต'); continue; }
    if (file.size > 10 * 1024 * 1024) { toastr.error('ไฟล์ ' + file.name + ' มีขนาดใหญ่เกิน 10MB', 'ขนาดใหญ่เกิน'); continue; }
    stageFileForUpload(file, fileType);
  }
}

async function stageFileForUpload(file, fileType) {
    const tempId = 'temp-' + Date.now() + '-' + Math.random();
    const isImage = file.type.startsWith('image/');
    const thumbEl = renderThumbnail(tempId, file.name, fileType, true, isImage, ''); 
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'thumbnail-loading';
    loadingDiv.innerHTML = '<div class="spinner-border" role="status"></div>';
    thumbEl.appendChild(loadingDiv);

    try {
        const base64Data = await base64Encode(file); 
        stagedUploads.push({ tempId: tempId, base64Data: base64Data.split(',')[1], mimeType: file.type, fileName: file.name, fileType: fileType, previewUrl: isImage ? base64Data : '' });
        
        if (isImage) {
            const img = thumbEl.querySelector('img');
            if (img) { img.src = base64Data; img.style.display = 'block'; }
        }
        loadingDiv.remove(); 
    } catch (error) {
        toastr.error('อ่านไฟล์ ' + file.name + ' ล้มเหลว', 'ผิดพลาด');
        thumbEl.remove();
    }
}

function deleteFileClient(thumbEl) {
  if (uploadMode !== 'edit') return; 
  const fileId = thumbEl.dataset.fileId;
  const fileType = thumbEl.dataset.fileType;
  if (thumbEl.dataset.isStaged === 'true') {
    stagedUploads = stagedUploads.filter(function(f) { return f.tempId !== fileId; });
    thumbEl.remove(); 
  } else {
    stagedDeletions.push({ fileId: fileId, fileType: fileType });
    thumbEl.style.display = 'none'; 
  }
}

function cancelUploadChanges() {
  setUploadMode('read'); 
  document.querySelectorAll('.thumbnail[data-is-staged="true"]').forEach(function(t) { t.remove(); });
  document.querySelectorAll('#modalUploadFiles .thumbnail[style*="display: none"]').forEach(function(t) { t.style.display = 'flex'; });
  stagedUploads = []; stagedDeletions = [];
}

function saveFileChangesClient() {
  loadingStart(); 
  const uploadsToSend = stagedUploads.map(function(f) { return { base64Data: f.base64Data, mimeType: f.mimeType, fileName: f.fileName, fileType: f.fileType }; });

  callAPI('saveFileChanges', { token: authToken, txId: currentUploadTxId, stagedUploads: uploadsToSend, stagedDeletions: stagedDeletions })
    .then(function(response) {
        loadingEnd();
        if (response.success) {
          uploadModal.hide(); 
          Swal.fire('สำเร็จ', response.message, 'success');
          loadDataTransactions(); 
          loadProjectSummary(); 
        } else {
          onFailure(new Error(response.message));
        }
    })
    .catch(function(err) { loadingEnd(); onFailure(err); });
}

function renderThumbnail(fileId, fileName, fileType, isStaged, isImage, previewUrl) {
    const container = document.getElementById('preview-' + fileType); 
    const thumb = document.createElement('div');
    thumb.className = 'thumbnail';
    thumb.dataset.fileId = fileId; thumb.dataset.fileType = fileType; thumb.dataset.isStaged = isStaged; 

    let fileUrl = ''; let displayName = ''; let clickHandler = 'style="cursor:default"'; 

    if (isStaged) {
        displayName = fileName; fileUrl = isImage ? previewUrl : ''; 
    } else {
        displayName = fileId.substring(0, 15) + '...'; isImage = true; 
        fileUrl = 'https://lh3.googleusercontent.com/d/' + fileId; 
        clickHandler = 'onclick="window.open(\'https://drive.google.com/file/d/' + fileId + '/view\', \'_blank\')"';
    }

    if (isImage) {
      thumb.innerHTML = '<img src="' + fileUrl + '" alt="' + displayName + '" ' + (isStaged && !previewUrl ? 'style="display:none;"' : '') + '><span class="file-info" title="' + displayName + '" ' + clickHandler + '>' + displayName + '</span>';
    } else {
      thumb.innerHTML = '<i class="file-icon ' + getFileIcon(displayName) + '"></i><span class="file-info" title="' + displayName + '" ' + clickHandler + '>' + displayName + '</span>';
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-file'; deleteBtn.innerHTML = '×'; deleteBtn.title = 'ลบไฟล์';
    deleteBtn.onclick = function(e) { e.stopPropagation(); deleteFileClient(thumb); };
    thumb.appendChild(deleteBtn);
    container.appendChild(thumb);
    return thumb;
}

function getFileIcon(fileName) {
  if (/\.pdf$/i.test(fileName)) return 'fa-solid fa-file-pdf text-danger';
  if (/\.(doc|docx)$/i.test(fileName)) return 'fa-solid fa-file-word text-primary';
  if (/\.(xls|xlsx)$/i.test(fileName)) return 'fa-solid fa-file-excel text-success';
  if (/\.(ppt|pptx)$/i.test(fileName)) return 'fa-solid fa-file-powerpoint text-warning';
  return 'fa-solid fa-file-alt'; 
}

function base64Encode(file) {
  return new Promise(function(resolve, reject) { 
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function() { resolve(reader.result); }; 
    reader.onerror = function(error) { reject(error); }; 
  });
}
