<!-- Scripts สำหรับ Admin CRUD (Projects & Users) -->
  <script>
    document.addEventListener('DOMContentLoaded', function() { // [SYNTAX FIX]
      // โหลดข้อมูลตาราง admin เมื่อแท็บถูกคลิก
      const adminTabs = document.getElementById('adminTabs');
      if (adminTabs) {
        const projectTab = adminTabs.querySelector('a[href="#tab-projects"]');
        const userTab = adminTabs.querySelector('a[href="#tab-users"]');
        const settingTab = adminTabs.querySelector('a[href="#tab-settings"]'); // [NEW] ดึงแท็บตั้งค่า

        if(projectTab) {
          projectTab.addEventListener('shown.bs.tab', function() { // [SYNTAX FIX]
             if ($.fn.DataTable.isDataTable('#tableProjects')) {
                // ถ้ามีตารางอยู่แล้ว แค่ปรับขนาด
                // [FIX] ลบ .responsive.recalc() ที่ไม่จำเป็นและทำให้เกิด Error ออก
                $('#tableProjects').DataTable().columns.adjust();
             } else {
                // ถ้ายังไม่มี ให้โหลดใหม่
                loadProjectData();
             }
          });
        }
        
        if(userTab) {
          userTab.addEventListener('shown.bs.tab', function() { // [SYNTAX FIX]
            if ($.fn.DataTable.isDataTable('#tableUsers')) {
               // [FIX] ลบ .responsive.recalc() ที่ไม่จำเป็นและทำให้เกิด Error ออก
               $('#tableUsers').DataTable().columns.adjust();
            } else {
               loadUsersData();
            }
          });
        }

        // [NEW] เพิ่ม Event Listener สำหรับแท็บตั้งค่า
        if(settingTab) {
          settingTab.addEventListener('shown.bs.tab', function() {
            // เมื่อแท็บตั้งค่าถูกเปิด ให้โหลดข้อมูลการตั้งค่า
            loadSystemSettings();
          });
        }

        // โหลดข้อมูลธุรกรรมในแท็บแรก (ถ้าล็อกอินอยู่)
        if (isLoggedIn && document.querySelector('#tab-transactions').classList.contains('active')) {
           loadDataTransactions();
        }
      }

      // [NEW] Event Listeners for Excel buttons
      const btnTemplate = document.getElementById('btn-template-project');
      const btnExport = document.getElementById('btn-export-project');
      const btnImport = document.getElementById('btn-import-project');
      const fileUploader = document.getElementById('projectFileUploader');

      if (btnTemplate) {
        btnTemplate.addEventListener('click', downloadProjectTemplate);
      }
      if (btnExport) {
        btnExport.addEventListener('click', exportProjects);
      }
      if (btnImport) {
        btnImport.addEventListener('click', function() {
          // Trigger the hidden file input
          if (fileUploader) fileUploader.click();
        });
      }
      if (fileUploader) {
        fileUploader.addEventListener('change', handleProjectImport);
      }

    });

    // [REFACTOR] 
    // (ลบฟังก์ชัน loadAssignableUsers() ออกจากที่นี่ เพราะย้ายไป script.html แล้ว)


    /** โหลดข้อมูลโครงการจากชีต */
    function loadProjectData() {
      if (userRole !== 'Admin') return; // [EDITED] เฉพาะ Admin
      if (!requireLogin()) return;
      loadingStart();
      google.script.run
        .withFailureHandler(onFailure) // [NEW] Added Failure Handler
        .withSuccessHandler(function(results) { // [SYNTAX FIX]
          loadingEnd();
          showProjectTable(results);
        })
        .getProjectData(authToken); // [EDITED] ส่ง Token
    }

    /** แสดงข้อมูลใน DataTable */
    function showProjectTable(items) {
      const tableId = '#tableProjects';

      if ($.fn.DataTable.isDataTable(tableId)) {
        $(tableId).DataTable().destroy();
      }

      if (!items || items.length === 0) {
        $(tableId).html("<thead><tr><th>ที่</th><th>รหัส</th><th>ชื่อโครงการ</th><th>งบประมาณ</th><th>ผู้รับผิดชอบ</th><th>การจัดการ</th></tr></thead><tbody><tr><td colspan='6' class='text-center'>ไม่พบข้อมูล</td></tr></tbody>");
        return;
      }
      
      new DataTable(tableId, {
        destroy: true,
        responsive: true,
        pageLength: 10,
        data: items,
        order: [[0, 'asc']],
        columns: [
          { 
            title: "ที่",
            data: null,
            render: function(data, type, row, meta) { return meta.row + 1; }, // [SYNTAX FIX]
            className: 'text-center'
          },
          { title: "รหัสโครงการ", data: 0, className: 'text-center' },
          { title: "ชื่อโครงการ", data: 1 },
          { 
            title: "งบประมาณ", 
            data: 2,
            render: function(data) { return Number(data || 0).toLocaleString(); }, // [SYNTAX FIX]
            className: 'text-end'
          },
          { 
            title: "ผู้รับผิดชอบ", 
            data: 3, // [REFACTOR] data[3] คือ String/JSON String
            render: function(data) { 
              // [MULTI-OWNER EDIT]
              // เรียก Helper (Global) จาก script.html เพื่อแปล String/JSON
              const ownerIds = _parseOwnerIds(data);
              // แปลง IDs เป็น Names
              const ownerNames = ownerIds.map(getUserFullName).join(', ');
              return ownerNames || '(ไม่ได้ระบุ)'; 
            }
          },
          {
            title: "การจัดการ",
            data: 0, // Project Code
            orderable: false,
            className: 'text-center',
            render: function(data) { // [SYNTAX FIX]
              // [EDITED] ซ่อนปุ่มถ้าไม่ใช่ Admin
              if (userRole !== 'Admin') return 'N/A';
              // [SYNTAX FIX]
              return (
                '<button class="btn btn-sm btn-warning me-1" onclick="openProjectModal(\'edit\',\'' + data + '\')">' +
                  '<i class="fa-solid fa-pen-to-square"></i>' +
                '</button>' +
                '<button class="btn btn-sm btn-danger" onclick="deleteProjectConfirm(\'' + data + '\')">' +
                  '<i class="fa-solid fa-trash"></i>' +
                '</button>'
              );
            }
          }
        ],
        pagingType: 'simple_numbers',
        language: {
          url: 'https://cdn.datatables.net/plug-ins/1.11.3/i18n/th.json',
          paginate: {
            previous: '<i class="fa-solid fa-caret-left"></i>',
            next: '<i class="fa-solid fa-caret-right"></i>'
          }
        }
      });
    }

    /** เปิด Modal เพิ่ม/แก้ไข */
    function openProjectModal(mode, code = "") {
      if (userRole !== 'Admin') return; // [EDITED] เฉพาะ Admin
      if (!requireLogin()) return;
      const modalEl = document.getElementById('projectModal');
      const modal = new bootstrap.Modal(modalEl);
      $('#myFormAddProject')[0].reset();
      $('#projectMode').val(mode);
      $('#projectId').val(code);

      // [REFACTOR] สร้าง Tom-Select โดยใช้ UUID
      if (tomSelectOwner) {
        tomSelectOwner.destroy(); // ทำลาย instance เก่า (ถ้ามี)
      }
      
      // [MULTI-OWNER EDIT] Tom-Select จะอ่าน 'multiple' จาก <select> ใน modal.html
      // ทำให้มันกลายเป็นโหมด Multi-select อัตโนมัติ
      tomSelectOwner = new TomSelect('#projectOwner', {
        valueField: 'id', // [REFACTOR] เปลี่ยนเป็น 'id' (UUID)
        labelField: 'fullName', // [REFACTOR]
        searchField: ['fullName'], // [REFACTOR]
        options: assignableUsers, // [REFACTOR] ใช้ {id, fullName}
        placeholder: 'เลือกผู้รับผิดชอบ (หรือเว้นว่างไว้)',
        // allowEmptyOption: true, // (ไม่จำเป็นสำหรับ multiple)
        create: false
      });
      // จบส่วน Tom-Select

      if (mode === "add") {
        $('#labelModalProjectModal').html('<i class="fa-solid fa-plus me-2"></i> เพิ่มโครงการ');
        $('#projectCode').prop('disabled', false);
        tomSelectOwner.setValue([]); // [MULTI-OWNER EDIT] ตั้งค่าเริ่มต้นเป็น Array ว่าง
        modal.show();
      } else if (mode === "edit") {
        $('#labelModalProjectModal').html('<i class="fa-solid fa-pen-to-square me-2"></i> แก้ไขโครงการ');
        loadingStart()
        google.script.run
          .withFailureHandler(onFailure) // [NEW] Added Failure Handler
          .withSuccessHandler(function(project) { // [SYNTAX FIX]
            loadingEnd()
            if (!project) {
              Swal.fire({ icon: 'error', title: 'ไม่พบข้อมูลโครงการนี้' });
              return;
            }
            $('#projectCode').val(project.ProjectCode).prop('disabled', true);
            $('#projectName').val(project.ProjectName);
            $('#projectBudget').val(project.Budget);
            
            // [MULTI-OWNER EDIT]
            // project.Owner คือ Raw String (JSON หรือ string เก่า)
            // 1. แปลงเป็น Array
            const ownerIds = _parseOwnerIds(project.Owner);
            // 2. ตั้งค่า Tom-Select ด้วย Array
            tomSelectOwner.setValue(ownerIds || []); 
            
            modal.show();
          })
          .getProjectByCode(authToken, code); // [EDITED] ส่ง Token
      }
    }

    /** บันทึกโครงการ */
    function saveProject() {
      if (userRole !== 'Admin') return; // [EDITED] เฉพาะ Admin
      if (!requireLogin()) return;
      
      const mode = $('#projectMode').val();
      const code = $('#projectCode').val().trim();
      const name = $('#projectName').val().trim();
      const budget = $('#projectBudget').val().trim();
      
      // [MULTI-OWNER EDIT] 
      // tomSelectOwner.getValue() จะคืนค่าเป็น "Array" ของ IDs
      // (เช่น ["uuid1", "uuid2"] หรือ [] ถ้าว่าง)
      // ซึ่งตรงกับที่ Backend (Code.gs) ต้องการพอดี
      const owner = tomSelectOwner.getValue(); 

      // [EDITED] ลบ owner ออกจาก required check
      if (!code || !name || !budget) {
        Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูล รหัส, ชื่อ, และงบประมาณ ให้ครบถ้วน' });
        return;
      }

      loadingStart();

      const callback = function(msg) { // [SYNTAX FIX]
        loadingEnd();
        // ข้อความจาก Server อาจจะเป็น Error (เช่น "❌ ...")
        const icon = msg.startsWith('✅') ? 'success' : 'error';
        Swal.fire({ icon: icon, title: msg });
        
        if (icon === 'success') {
          bootstrap.Modal.getInstance(document.getElementById('projectModal')).hide();
          loadProjectData(); // โหลดตารางโครงการใหม่
          loadProjects(); // โหลด Dropdown ใหม่
          loadProjectSummary(); // อัปเดต Dashboard (และฟอร์ม admin)
        }
      };
      
      if (mode === "add") {
        google.script.run
          .withFailureHandler(onFailure) // [NEW] Added Failure Handler
          .withSuccessHandler(callback)
          .addProject(authToken, code, name, budget, owner); // [EDITED] ส่ง Token
      } else {
        google.script.run
          .withFailureHandler(onFailure) // [NEW] Added Failure Handler
          .withSuccessHandler(callback)
          .updateProject(authToken, code, name, budget, owner); // [EDITED] ส่ง Token
      }
    }

    /** ลบโครงการ */
    function deleteProjectConfirm(code) {
      if (userRole !== 'Admin') return; // [EDITED] เฉพาะ Admin
      if (!requireLogin()) return;
      
      Swal.fire({
        title: 'คุณต้องการลบโครงการนี้หรือไม่?',
        text: 'รหัส: ' + code + ' (การดำเนินการนี้ไม่สามารถย้อนกลับได้)', // [SYNTAX FIX]
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: 'var(--danger-color)',
        cancelButtonColor: '#6c757d',
      }).then(function(result) { // [SYNTAX FIX]
        if (result.isConfirmed) {
          loadingStart();
          google.script.run
            .withFailureHandler(onFailure) // [NEW] Added Failure Handler
            .withSuccessHandler(function(msg) { // [SYNTAX FIX]
              loadingEnd();
              const icon = msg.startsWith('🗑️') ? 'success' : 'error';
              Swal.fire({ icon: icon, title: msg });
              
              if (icon === 'success') {
                loadProjectData(); // โหลดตารางโครงการใหม่
                loadProjects(); // โหลด Dropdown ใหม่
                loadProjectSummary(); // อัปเดต Dashboard (และฟอร์ม admin)
              }
            })
            .deleteProject(authToken, code); // [EDITED] ส่ง Token
        }
      });
    }

    // =======================================
    // [NEW] ฟังก์ชันสำหรับ Excel Import / Export
    // =======================================

    /**
     * [NEW] 1. ดาวน์โหลดไฟล์ Template สำหรับนำเข้าโครงการ
     */
    function downloadProjectTemplate() {
      if (userRole !== 'Admin' || !requireLogin()) return;
      
      loadingStart();
      try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Projects_Template');

        // กำหนด Columns (Template ไม่ต้องมี Owner)
        worksheet.columns = [
          { header: 'ProjectCode', key: 'code', width: 25 },
          { header: 'ProjectName', key: 'name', width: 40 },
          { header: 'Budget', key: 'budget', width: 20 }
        ];

        // ตกแต่ง Header
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FF000000' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFF00' } // สีเหลือง
        };
        headerRow.eachCell(function(cell) {
          cell.border = { bottom: { style: 'thin' } };
        });

        // สร้างไฟล์และดาวน์โหลด
        workbook.xlsx.writeBuffer().then(function(buffer) {
          saveAs(new Blob([buffer], { type: "application/octet-stream" }), "Project_Template.xlsx");
          loadingEnd();
        });

      } catch (err) {
        onFailure(err);
      }
    }

    /**
     * [NEW] 2. ส่งออกข้อมูลโครงการทั้งหมดเป็น Excel
     */
    function exportProjects() {
      if (userRole !== 'Admin' || !requireLogin()) return;
      loadingStart();
      // เรียกใช้ฟังก์ชันเดิมที่ดึงข้อมูลตารางโครงการ
      google.script.run
        .withFailureHandler(onFailure)
        .withSuccessHandler(onDataForExport)
        .getProjectData(authToken);
    }

    /**
     * [NEW] 2b. Callback เมื่อได้รับข้อมูลสำหรับ Export
     */
    function onDataForExport(data) {
      if (!data || data.length === 0) {
        loadingEnd();
        toastr.info('ไม่พบข้อมูลโครงการที่จะส่งออก');
        return;
      }

      try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Project_Export');

        // กำหนด Columns (ข้อมูลดิบ)
        worksheet.columns = [
          { header: 'ProjectCode', key: 'code', width: 25 },
          { header: 'ProjectName', key: 'name', width: 40 },
          { header: 'Budget', key: 'budget', width: 20 },
          { header: 'Owner (JSON)', key: 'owner', width: 40 }
        ];
        
        // ตกแต่ง Header
        worksheet.getRow(1).font = { bold: true };

        // เพิ่มข้อมูล (data คือ Array of Arrays)
        data.forEach(function(row) {
          worksheet.addRow({
            code: row[0],
            name: row[1],
            budget: parseFloat(row[2]) || 0,
            owner: row[3] // ส่งออก Owner (JSON String) ไปตรงๆ
          });
        });

        // สร้างไฟล์และดาวน์โหลด
        workbook.xlsx.writeBuffer().then(function(buffer) {
          saveAs(new Blob([buffer], { type: "application/octet-stream" }), "Project_Export.xlsx");
          loadingEnd();
        });

      } catch (err) {
        onFailure(err);
      }
    }

    /**
     * [NEW] 3. จัดการไฟล์ Excel ที่ผู้ใช้นำเข้า
     */
    async function handleProjectImport(e) {
      if (userRole !== 'Admin' || !requireLogin()) return;
      
      const file = e.target.files[0];
      if (!file) return;

      loadingStart();
      
      try {
        const workbook = new ExcelJS.Workbook();
        const arrayBuffer = await file.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);

        const worksheet = workbook.getWorksheet(1); // เอาชีตแรก
        if (!worksheet) {
          throw new Error("ไม่พบ Worksheet ในไฟล์ Excel");
        }

        const projectsToImport = [];
        let headerCount = 0;

        worksheet.eachRow(function(row, rowNumber) {
          if (rowNumber === 1) {
            // ตรวจสอบ Header (เผื่อผู้ใช้แก้)
            if (String(row.getCell(1).value).trim() === 'ProjectCode') headerCount++;
            if (String(row.getCell(2).value).trim() === 'ProjectName') headerCount++;
            if (String(row.getCell(3).value).trim() === 'Budget') headerCount++;
            return; // ข้ามหัวตาราง
          }

          const project = {
            code: String(row.getCell(1).value || '').trim(),
            name: String(row.getCell(2).value || '').trim(),
            budget: parseFloat(row.getCell(3).value) || 0
          };

          // ต้องมี code และ name เท่านั้นถึงจะเพิ่ม
          if (project.code && project.name) {
            projectsToImport.push(project);
          }
        });

        if (headerCount < 3) {
           throw new Error("ไฟล์ Template ไม่ถูกต้อง กรุณาดาวน์โหลด Template ใหม่");
        }

        if (projectsToImport.length === 0) {
          loadingEnd();
          toastr.info('ไม่พบข้อมูลที่จะนำเข้าในไฟล์');
          return;
        }

        // ส่งข้อมูล (JSON) ไปให้ Server
        google.script.run
          .withFailureHandler(onFailure)
          .withSuccessHandler(onImportComplete)
          .importProjects(authToken, projectsToImport);

      } catch (err) {
        onFailure(err);
      } finally {
        // เคลียร์ค่า file input เพื่อให้เลือกไฟล์เดิมซ้ำได้
        $(e.target).val(null);
      }
    }

    /**
     * [NEW] 3b. Callback เมื่อ Server นำเข้าข้อมูลเสร็จ
     */
    function onImportComplete(response) {
      loadingEnd();
      if (response.success) {
        let title = 'นำเข้าสำเร็จ!';
        let icon = 'success';
        let html = '<p>✅ เพิ่มข้อมูลใหม่: <strong>' + response.added + '</strong> รายการ</p>';

        if (response.skipped && response.skipped.length > 0) {
          title = 'นำเข้าสำเร็จ (มีข้อมูลซ้ำ)';
          icon = 'warning';
          html += '<p>⚠️ ข้ามข้อมูล (รหัสซ้ำ): <strong>' + response.skipped.length + '</strong> รายการ</p>' +
                  '<small>(' + response.skipped.join(', ') + ')</small>';
        }

        Swal.fire({
          icon: icon,
          title: title,
          html: html
        });

        // รีเฟรชข้อมูลใหม่
        loadProjectData(); // โหลดตารางโครงการใหม่
        loadProjects(); // โหลด Dropdown ใหม่
        loadProjectSummary(); // อัปเดต Dashboard

      } else {
        // ถ้า Server ส่ง Error กลับมา
        onFailure(new Error(response.message));
      }
    }


    //ส่วนของการแก้ไข
    /** โหลดข้อมูลผู้ใช้งาน */
    function loadUsersData() {
      if (userRole !== 'Admin') return; // [EDITED] เฉพาะ Admin
      if (!requireLogin()) return;
      
      loadingStart();
      google.script.run
        .withFailureHandler(onFailure) // [NEW] Added Failure Handler
        .withSuccessHandler(function(results) { // [SYNTAX FIX]
          loadingEnd();
          showUserTable(results);
        })
        .getUserData(authToken); // [EDITED] ส่ง Token
    }

    // 🔹 แสดงตารางผู้ใช้งาน
    function showUserTable(users) {
      const tableId = '#tableUsers';

      if ($.fn.DataTable.isDataTable(tableId)) {
        $(tableId).DataTable().destroy();
      }

      if (!users || users.length === 0) {
        $(tableId).html("<thead><tr><th>#</th><th>Username</th><th>Full Name</th><th>Status</th><th>Role</th><th>Action</th></tr></thead><tbody><tr><td colspan='6' class='text-center'>ไม่พบข้อมูล</td></tr></tbody>");
        return;
      }

      new DataTable(tableId, {
        destroy: true,
        responsive: true,
        pageLength: 10,
        data: users,
        order: [[0, 'asc']],
        columns: [
          {
            title: "#",
            data: null,
            render: function(data, type, row, meta) { return meta.row + 1; }, // [SYNTAX FIX]
            className: 'text-center'
          },
          { title: "Username", data: "username" },
          { title: "Full Name", data: "fullName" },
          {
            title: "Status",
            data: "status",
            className: 'text-center',
            render: function(data) { // [SYNTAX FIX]
              return data === 'active' 
              ? '<span class="badge bg-success-subtle text-success-emphasis rounded-pill">Active</span>'
              : '<span class="badge bg-danger-subtle text-danger-emphasis rounded-pill">Inactive</span>'
            }
          },
          { title: "Role", data: "role", className: 'text-center' }, // [EDITED] เพิ่มคอลัมน์ Role
          {
            title: "Action",
            data: "id", // [REFACTOR] data คือ UUID
            orderable: false,
            className: 'text-center',
            render: function(data) { // [SYNTAX FIX]
              // [EDITED] ซ่อนปุ่มถ้าไม่ใช่ Admin
              if (userRole !== 'Admin') return 'N/A';
              // [SYNTAX FIX]
              return (
                '<button class="btn btn-sm btn-warning me-1" onclick="editUser(\'' + data + '\')">' +
                  '<i class="fa-solid fa-pen-to-square"></i>' +
                '</button>' +
                '<button class="btn btn-sm btn-danger" onclick="deleteUserConfirm(\'' + data + '\')">' +
                  '<i class="fa-solid fa-trash-can"></i>' +
                '</button>'
              );
            }
          }
        ],
        pagingType: 'simple_numbers',
        language: {
          url: 'https://cdn.datatables.net/plug-ins/1.11.3/i18n/th.json',
          paginate: {
            previous: '<i class="fa-solid fa-caret-left"></i>',
            next: '<i class="fa-solid fa-caret-right"></i>'
          }
        }
      });
    }

    // 🔹 เปิดโมดอลเพิ่มผู้ใช้งาน
    function openUserModal() {
      if (userRole !== 'Admin') return; // [EDITED] เฉพาะ Admin
      if (!requireLogin()) return;
      
      $("#formUser")[0].reset();
      $("#userId").val('');
      $("#roleUser").val('Viewer'); // [EDITED] ตั้งค่าเริ่มต้น
      $("#status").val('active');
      $("#modalUserLabel").html('<i class="fas fa-user-plus me-2"></i> เพิ่มผู้ใช้งาน');
      const modal = new bootstrap.Modal(document.getElementById('modalUser'));
      modal.show();
    }

    // 🔹 แก้ไขผู้ใช้งาน
    function editUser(id) {
      if (userRole !== 'Admin') return; // [EDITED] เฉพาะ Admin
      if (!requireLogin()) return;
      
      loadingStart()
      google.script.run
        .withFailureHandler(onFailure) // [NEW] Added Failure Handler
        .withSuccessHandler(function(user) { // [SYNTAX FIX]
          loadingEnd()
          if (!user) return Swal.fire('ไม่พบผู้ใช้งาน', '', 'error');
          $("#userId").val(user.id);
          $("#usernameUser").val(user.username);
          $("#passwordUser").val(user.password);
          $("#fullName").val(user.fullName);
          $("#status").val(user.status);
          $("#roleUser").val(user.role); // [EDITED] เพิ่ม Role
          $("#modalUserLabel").html('<i class="fas fa-user-pen me-2"></i> แก้ไขผู้ใช้งาน');
          const modal = new bootstrap.Modal(document.getElementById('modalUser'));
          modal.show();
        })
        .getUserById(authToken, id); // [EDITED] ส่ง Token
    }

    // 🔹 ลบผู้ใช้งาน
    function deleteUserConfirm(id) {
      if (userRole !== 'Admin') return; // [EDITED] เฉพาะ Admin
      if (!requireLogin()) return;
      
      Swal.fire({
        title: 'คุณแน่ใจหรือไม่?',
        text: "การลบผู้ใช้งานจะไม่สามารถย้อนกลับได้!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--danger-color)',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'ลบ',
        cancelButtonText: 'ยกเลิก'
      }).then(function(result) { // [SYNTAX FIX]
        if (result.isConfirmed) {
          loadingStart();
          google.script.run
            .withFailureHandler(onFailure) // [NEW] Added Failure Handler
            .withSuccessHandler(function(msg) { // [SYNTAX FIX]
              loadingEnd();
              const icon = msg.startsWith('ลบ') ? 'success' : 'error';
              Swal.fire({ icon: icon, title: msg });
              if (icon === 'success') {
                loadUsersData();
                // [REFACTOR] เรียกใช้ฟังก์ชัน Global จาก script.html
                loadAssignableUsers(); 
              }
            })
            .deleteUser(authToken, id); // [EDITED] ส่ง Token
        }
      });
    }

    // 🔹 บันทึกผู้ใช้งาน
    $("#formUser").submit(function (e) {
      e.preventDefault();
      if (userRole !== 'Admin') return; // [EDITED] เฉพาะ Admin
      if (!requireLogin()) return;

      const data = {
        id: $("#userId").val(),
        username: $("#usernameUser").val().trim(),
        password: $("#passwordUser").val(),
        fullName: $("#fullName").val(),
        status: $("#status").val(),
        role: $("#roleUser").val() // [EDITED] เพิ่ม Role
      };

      if (!data.username || !data.password || !data.fullName || !data.status || !data.role) {
        return Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
      }
      
      loadingStart()
      
      google.script.run
        .withFailureHandler(onFailure) // [NEW] Added Failure Handler
        .withSuccessHandler(function(msg) { // [SYNTAX FIX]
          loadingEnd()
          const icon = msg.includes('สำเร็จ') ? 'success' : 'error';
          Swal.fire({ icon: icon, title: msg });
          
          if (icon === 'success') {
            bootstrap.Modal.getInstance(document.getElementById('modalUser')).hide();
            loadUsersData();
            // [REFACTOR] เรียกใช้ฟังก์ชัน Global จาก script.html
            loadAssignableUsers(); 
          }
        })
        .saveUserData(authToken, data); // [EDITED] ส่ง Token
    });

    // =======================================
    // [NEW] ฟังก์ชันสำหรับหน้าตั้งค่าระบบ
    // =======================================

    /**
     * [NEW] โหลดข้อมูลการตั้งค่าระบบปัจจุบัน
     */
    function loadSystemSettings() {
      if (userRole !== 'Admin') return; // ตรวจสอบสิทธิ์
      if (!requireLogin()) return;

      loadingStart();
      google.script.run
        .withFailureHandler(onFailure)
        .withSuccessHandler(function(response) {
          loadingEnd();
          if (response.success) {
            $('#driveFolderId').val(response.folderId);
          } else {
            Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลการตั้งค่าได้: ' + response.message, 'error');
          }
        })
        .getDriveFolderId(authToken); // [NEW] เรียกฟังก์ชันที่เพิ่มใน Code.gs
    }

    /**
     * [NEW] บันทึกการตั้งค่าระบบ
     */
    $("#formSettings").submit(function (e) {
      e.preventDefault();
      if (userRole !== 'Admin') return; // ตรวจสอบสิทธิ์
      if (!requireLogin()) return;

      const newFolderId = $('#driveFolderId').val().trim();

      if (!newFolderId) {
        Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณากรอก Google Drive Folder ID', 'warning');
        return;
      }

      Swal.fire({
        title: 'ยืนยันการบันทึก',
        text: 'คุณต้องการอัปเดต Folder ID ใช่หรือไม่? การเปลี่ยนแปลงนี้มีผลต่อระบบไฟล์แนบ',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ใช่, บันทึก',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: 'var(--success-color)',
      }).then(function(result) {
        if (result.isConfirmed) {
          loadingStart();
          google.script.run
            .withFailureHandler(onFailure)
            .withSuccessHandler(function(response) {
              loadingEnd();
              if (response.success) {
                Swal.fire('สำเร็จ!', response.message, 'success');
                // โหลดซ้ำเพื่อยืนยันว่าค่าถูกบันทึก
                loadSystemSettings(); 
              } else {
                Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึกได้: ' + response.message, 'error');
              }
            })
            .setDriveFolderId(authToken, newFolderId); // [NEW] เรียกฟังก์ชันที่เพิ่มใน Code.gs
        }
      });
    });

  </script>
