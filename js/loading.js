// ในไฟล์ js/loading.js ให้มีแค่ 2 ฟังก์ชันนี้เท่านั้นครับ ห้ามมีแท็ก HTML ใดๆ
function loadingStart() {
  $('#loading').removeClass('hidden');
}

function loadingEnd() {
  $('#loading').addClass('hidden');
}
