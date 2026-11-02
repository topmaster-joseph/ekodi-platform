(()=>{
'use strict';
if(window.__EKODI_CHURCH_PAYMENT_I18N__)return;
window.__EKODI_CHURCH_PAYMENT_I18N__=true;

const LANGS=new Set(['my','kac','vi','mn','id']);
const M={};
function add(ko,my,kac,vi,mn,id){M[ko]={my,kac,vi,mn,id};}
add('온라인 헌금','အွန်လိုင်း အလှူ','Online hkungga','Dâng hiến trực tuyến','Онлайн өргөл','Persembahan online');
add('카드·자동이체는 미션펀드 보안 후원창에서, 계좌이체는 아래 공식 계좌로 진행합니다.','ကတ်နှင့် အလိုအလျောက်ငွေလွှဲကို MissionFund လုံခြုံသောအလှူဝင်းဒိုးတွင် အသုံးပြုပြီး ဘဏ်လွှဲရန် အောက်ပါ တရားဝင်အကောင့်ကို အသုံးပြုပါ။','Card hte automatic transfer hpe MissionFund secure giving window hta lang, bank transfer hpe npu na official account hta galaw rit.','Dùng thẻ hoặc trích nợ tự động trong cửa sổ dâng hiến bảo mật của MissionFund; chuyển khoản vào tài khoản chính thức bên dưới.','Карт болон автомат шилжүүлгийг MissionFund-ийн хамгаалалттай өргөлийн цонхоор, банкны шилжүүлгийг доорх албан ёсны дансаар хийнэ.','Gunakan kartu atau transfer otomatis melalui jendela donasi aman MissionFund; transfer bank ke rekening resmi di bawah.');
add('카드·자동이체 연결 확인 중','ကတ်·အလိုအလျောက်ငွေလွှဲ ချိတ်ဆက်မှု စစ်ဆေးနေသည်','Card · automatic transfer connection hpe yu nga ai','Đang kiểm tra kết nối thẻ · trích nợ tự động','Карт · автомат шилжүүлгийн холболтыг шалгаж байна','Memeriksa koneksi kartu · transfer otomatis');
add('에코디교회 · 십일조·주일헌금','EKODI အသင်းတော် · ဆယ်ဖို့တစ်ဖို့ · တနင်္ဂနွေ အလှူ','EKODI Nawku Htingnu · Tithe · Sunday hkungga','Hội thánh EKODI · Phần mười · Dâng hiến Chúa nhật','EKODI Сүм · Аравны нэг · Нямын өргөл','Gereja EKODI · Persepuluhan · Persembahan Minggu');
add('에코디선교회 · 선교헌금','EKODI သာသနာအဖွဲ့ · သာသနာ အလှူ','EKODI Mission · Mission hkungga','Sứ vụ EKODI · Dâng hiến truyền giáo','EKODI Илгээлт · Илгээлтийн өргөл','Misi EKODI · Persembahan misi');
add('에코디커뮤니티 · 선교헌금','EKODI ကွန်မြူနတီ · သာသနာ အလှူ','EKODI Community · Mission hkungga','Cộng đồng EKODI · Dâng hiến truyền giáo','EKODI Нийгэмлэг · Илгээлтийн өргөл','Komunitas EKODI · Persembahan misi');
add('카드·자동이체','ကတ်·အလိုအလျောက်ငွေလွှဲ','Card · automatic transfer','Thẻ · trích nợ tự động','Карт · автомат шилжүүлэг','Kartu · transfer otomatis');
add('미션펀드의 안전한 후원창에서 카드와 자동이체를 이용할 수 있습니다.','MissionFund လုံခြုံသောအလှူဝင်းဒိုးတွင် ကတ်နှင့် အလိုအလျောက်ငွေလွှဲကို အသုံးပြုနိုင်သည်။','MissionFund secure giving window hta card hte automatic transfer lang lu ai.','Có thể dùng thẻ và trích nợ tự động trong cửa sổ dâng hiến bảo mật của MissionFund.','MissionFund-ийн хамгаалалттай өргөлийн цонхонд карт болон автомат шилжүүлэг ашиглаж болно.','Kartu dan transfer otomatis tersedia di jendela donasi aman MissionFund.');
add('카드·자동이체 연결 확인 필요','ကတ်·အလိုအလျောက်ငွေလွှဲ ချိတ်ဆက်မှု စစ်ဆေးရန် လိုအပ်','Card · automatic transfer connection hpe bai yu ra ai','Cần kiểm tra kết nối thẻ · trích nợ tự động','Карт · автомат шилжүүлгийн холболтыг шалгах шаардлагатай','Periksa koneksi kartu · transfer otomatis');
add('현재 계좌이체를 이용해 주세요.','ယခုအချိန်တွင် ဘဏ်လွှဲမှုကို အသုံးပြုပါ။','Ya aten bank transfer hpe lang ya rit.','Hiện tại vui lòng dùng chuyển khoản.','Одоогоор банкны шилжүүлэг ашиглана уу.','Untuk saat ini silakan gunakan transfer bank.');
add('안전한 후원 연결을 확인할 수 없습니다. 계좌이체를 이용해 주세요.','လုံခြုံသောအလှူ ချိတ်ဆက်မှုကို မစစ်ဆေးနိုင်ပါ။ ဘဏ်လွှဲမှုကို အသုံးပြုပါ။','Secure giving connection hpe n lu yu ai. Bank transfer hpe lang rit.','Không thể xác minh kết nối dâng hiến an toàn. Vui lòng dùng chuyển khoản.','Аюулгүй өргөлийн холболтыг баталгаажуулж чадсангүй. Банкны шилжүүлэг ашиглана уу.','Koneksi donasi aman tidak dapat diverifikasi. Silakan gunakan transfer bank.');
add('카드·간편결제 또는 공식 계좌이체 중 편한 방법을 선택할 수 있습니다.','ကတ်·အမြန်ငွေပေးချေမှု သို့မဟုတ် တရားဝင်ဘဏ်လွှဲမှုထဲမှ အဆင်ပြေရာကို ရွေးနိုင်သည်။','Card · quick payment rai ningsang official bank transfer hta myit hkrum ai lam hpe lata lu ai.','Bạn có thể chọn thẻ · thanh toán nhanh hoặc chuyển khoản vào tài khoản chính thức.','Карт · шуурхай төлбөр эсвэл албан ёсны банкны шилжүүлгээс тохирохыг сонгоно.','Pilih kartu · pembayaran cepat atau transfer ke rekening resmi.');
add('결제 연결 확인 중','ငွေပေးချေမှု ချိတ်ဆက်မှု စစ်ဆေးနေသည်','Payment connection hpe yu nga ai','Đang kiểm tra kết nối thanh toán','Төлбөрийн холболтыг шалгаж байна','Memeriksa koneksi pembayaran');
add('안전한 결제 연결 상태를 확인하고 있습니다.','လုံခြုံသော ငွေပေးချေမှု ချိတ်ဆက်မှုကို စစ်ဆေးနေသည်။','Safe payment connection hpe yu nga ai.','Đang kiểm tra kết nối thanh toán an toàn.','Аюулгүй төлбөрийн холболтыг шалгаж байна.','Memeriksa koneksi pembayaran yang aman.');
add('헌금 종류와 금액을 선택한 뒤 카드·간편결제로 진행합니다.','အလှူအမျိုးအစားနှင့် ပမာဏကို ရွေးပြီး ကတ်·အမြန်ငွေပေးချေမှုဖြင့် ဆက်လုပ်ပါ။','Hkungga baw hte amount lata nna card · quick payment hte matut galaw.','Chọn loại và số tiền dâng hiến, sau đó tiếp tục bằng thẻ hoặc thanh toán nhanh.','Өргөлийн төрөл, дүнг сонгоод карт · шуурхай төлбөрөөр үргэлжлүүлнэ.','Pilih jenis dan jumlah persembahan, lalu lanjutkan dengan kartu atau pembayaran cepat.');
add('온라인 헌금 창 닫기','အွန်လိုင်း အလှူဝင်းဒိုး ပိတ်ရန်','Online hkungga window pat','Đóng cửa sổ dâng hiến trực tuyến','Онлайн өргөлийн цонх хаах','Tutup jendela persembahan online');
add('감사헌금','ကျေးဇူးတင် အလှူ','Chyeju hkungga','Dâng hiến tạ ơn','Талархлын өргөл','Persembahan syukur');
add('기타헌금','အခြား အလှူ','Shaga hkungga','Dâng hiến khác','Бусад өргөл','Persembahan lainnya');
add('카드 정보는 에코디교회가 직접 저장하지 않으며 결제사 보안창에서 처리됩니다.','ကတ်အချက်အလက်ကို EKODI အသင်းတော်က မသိမ်းဆည်းဘဲ ငွေပေးချေမှုကုမ္ပဏီ၏ လုံခြုံသောဝင်းဒိုးတွင် ကိုင်တွယ်သည်။','Card information hpe EKODI Nawku Htingnu n mari da ai; payment company a secure window hta galaw ai.','Hội thánh EKODI không lưu thông tin thẻ; dữ liệu được xử lý trong cửa sổ bảo mật của đơn vị thanh toán.','EKODI Сүм картын мэдээллийг хадгалахгүй; төлбөрийн компанийн хамгаалалттай цонхонд боловсруулна.','Gereja EKODI tidak menyimpan informasi kartu; data diproses di jendela aman penyedia pembayaran.');
add('카드·간편결제','ကတ်·အမြန်ငွေပေးချေမှု','Card · quick payment','Thẻ · thanh toán nhanh','Карт · шуурхай төлбөр','Kartu · pembayaran cepat');
add('카드·간편결제와 계좌이체를 사용할 수 있습니다.','ကတ်·အမြန်ငွေပေးချေမှုနှင့် ဘဏ်လွှဲမှုကို အသုံးပြုနိုင်သည်။','Card · quick payment hte bank transfer lang lu ai.','Có thể dùng thẻ · thanh toán nhanh và chuyển khoản.','Карт · шуурхай төлбөр болон банкны шилжүүлэг ашиглаж болно.','Kartu · pembayaran cepat dan transfer bank tersedia.');
add('카드·간편결제 PG 연결 필요','ကတ်·အမြန်ငွေပေးချေမှု PG ချိတ်ဆက်ရန် လိုအပ်','Card · quick payment PG connection ra ai','Cần kết nối PG cho thẻ · thanh toán nhanh','Карт · шуурхай төлбөрийн PG холболт шаардлагатай','Perlu koneksi PG untuk kartu · pembayaran cepat');
add('계좌이체는 바로 이용할 수 있으며 카드·간편결제는 PG 운영키 연결 후 자동 활성화됩니다.','ဘဏ်လွှဲမှုကို ချက်ချင်းအသုံးပြုနိုင်ပြီး ကတ်·အမြန်ငွေပေးချေမှုသည် PG လုပ်ငန်းသုံးကီး ချိတ်ဆက်ပြီးနောက် အလိုအလျောက် အသက်ဝင်မည်။','Bank transfer gaw tut ai lang lu ai; card · quick payment gaw PG operation key matut hkrum jang automatic activate byin ai.','Chuyển khoản dùng được ngay; thẻ · thanh toán nhanh sẽ tự bật sau khi kết nối khóa vận hành PG.','Банкны шилжүүлгийг шууд ашиглаж болно; карт · шуурхай төлбөр PG үйлдлийн түлхүүр холбогдсоны дараа автоматаар идэвхжинэ.','Transfer bank dapat langsung digunakan; kartu · pembayaran cepat aktif otomatis setelah kunci operasional PG terhubung.');
add('카드·간편결제 연결 확인 필요','ကတ်·အမြန်ငွေပေးချေမှု ချိတ်ဆက်မှု စစ်ဆေးရန် လိုအပ်','Card · quick payment connection hpe bai yu ra ai','Cần kiểm tra kết nối thẻ · thanh toán nhanh','Карт · шуурхай төлбөрийн холболтыг шалгах шаардлагатай','Periksa koneksi kartu · pembayaran cepat');
add('현재 계좌이체를 이용해 주세요.','ယခုအချိန်တွင် ဘဏ်လွှဲမှုကို အသုံးပြုပါ။','Ya aten bank transfer hpe lang ya rit.','Hiện tại vui lòng dùng chuyển khoản.','Одоогоор банкны шилжүүлэг ашиглана уу.','Untuk saat ini silakan gunakan transfer bank.');
add('결제창 준비 중','ငွေပေးချေမှုဝင်းဒိုး ပြင်ဆင်နေသည်','Payment window hpe jin jin galaw nga ai','Đang chuẩn bị cửa sổ thanh toán','Төлбөрийн цонхыг бэлтгэж байна','Menyiapkan jendela pembayaran');
add('결제창을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.','ငွေပေးချေမှုဝင်းဒိုးကို မဖွင့်နိုင်ပါ။ ခဏနောက် ပြန်ကြိုးစားပါ။','Payment window n lu hpaw ai. N-gun na bai chyam yu rit.','Không thể mở cửa sổ thanh toán. Vui lòng thử lại sau.','Төлбөрийн цонхыг нээж чадсангүй. Түр хүлээгээд дахин оролдоно уу.','Jendela pembayaran tidak dapat dimuat. Coba lagi sebentar lagi.');
add('선택한 금액 결제하기','ရွေးထားသော ပမာဏ ပေးချေရန်','Lata da ai amount jaw','Thanh toán số tiền đã chọn','Сонгосон дүнг төлөх','Bayar jumlah terpilih');
add('결제 요청 중…','ငွေပေးချေမှု တောင်းဆိုနေသည်…','Payment hpyi nga ai…','Đang gửi yêu cầu thanh toán…','Төлбөрийн хүсэлт илгээж байна…','Mengirim permintaan pembayaran…');
add('결제 요청을 시작하지 못했습니다. 결제 연결 상태를 확인하거나 계좌이체를 이용해 주세요.','ငွေပေးချေမှုကို မစတင်နိုင်ပါ။ ချိတ်ဆက်မှုကို စစ်ဆေးပါ သို့မဟုတ် ဘဏ်လွှဲမှုကို အသုံးပြုပါ။','Payment n lu ningpawt ai. Connection hpe yu rai ningsang bank transfer hpe lang rit.','Không thể bắt đầu thanh toán. Hãy kiểm tra kết nối hoặc dùng chuyển khoản.','Төлбөр эхлүүлж чадсангүй. Холболтоо шалгах эсвэл банкны шилжүүлэг ашиглана уу.','Pembayaran tidak dapat dimulai. Periksa koneksi atau gunakan transfer bank.');
add('헌금 결제가 완료되었습니다.','အလှူငွေပေးချေမှု ပြီးဆုံးပါပြီ။','Hkungga payment ngut sai.','Dâng hiến đã thanh toán thành công.','Өргөлийн төлбөр амжилттай дууслаа.','Pembayaran persembahan selesai.');
add('결제를 완료하지 못했습니다.','ငွေပေးချေမှု မပြီးဆုံးနိုင်ပါ။','Payment n ngut lu ai.','Thanh toán chưa hoàn tất.','Төлбөрийг дуусгаж чадсангүй.','Pembayaran belum selesai.');
add('결제 영수증 보기 ↗','ငွေပေးချေမှု ပြေစာ ကြည့်ရန် ↗','Payment receipt yu ↗','Xem biên lai thanh toán ↗','Төлбөрийн баримт харах ↗','Lihat bukti pembayaran ↗');
add('결제가 취소되었거나 인증에 실패했습니다.','ငွေပေးချေမှု ပယ်ဖျက်ထားသည် သို့မဟုတ် အတည်ပြုမှု မအောင်မြင်ပါ။','Payment cancel byin sai rai ningsang verification n awng ai.','Thanh toán đã bị hủy hoặc xác thực không thành công.','Төлбөр цуцлагдсан эсвэл баталгаажуулалт амжилтгүй боллоо.','Pembayaran dibatalkan atau verifikasi gagal.');
add('결제 승인 정보가 올바르지 않습니다. 교회로 문의해 주세요.','ငွေပေးချေမှု အတည်ပြုအချက်အလက် မမှန်ပါ။ အသင်းတော်သို့ ဆက်သွယ်ပါ။','Payment approval information n jaw ai. Nawku Htingnu hpe matut mahkai rit.','Thông tin phê duyệt thanh toán không hợp lệ. Vui lòng liên hệ Hội thánh.','Төлбөр батлах мэдээлэл буруу байна. Сүмтэй холбогдоно уу.','Informasi persetujuan pembayaran tidak valid. Silakan hubungi gereja.');
add('결제 승인을 확인하고 있습니다.','ငွေပေးချေမှု အတည်ပြုချက် စစ်ဆေးနေသည်။','Payment approval hpe yu nga ai.','Đang xác nhận phê duyệt thanh toán.','Төлбөрийн баталгаажуулалтыг шалгаж байна.','Memeriksa persetujuan pembayaran.');
add('결제 인증 후 승인 확인에 문제가 생겼습니다. 중복 결제하지 마시고 교회로 문의해 주세요.','ငွေပေးချေမှု အတည်ပြုပြီးနောက် အတည်ပြုချက် စစ်ဆေးရာတွင် ပြဿနာရှိသည်။ ထပ်မံမပေးချေဘဲ အသင်းတော်သို့ ဆက်သွယ်ပါ။','Payment verification ngut ai hpang approval hpe yu ai hta problem nga ai. Bai n jaw ai sha Nawku Htingnu hpe matut mahkai rit.','Có lỗi khi xác nhận phê duyệt sau bước xác thực. Đừng thanh toán lại; vui lòng liên hệ Hội thánh.','Баталгаажуулалтын дараах зөвшөөрлийг шалгахад алдаа гарлаа. Давхар төлбөр бүү хийгээрэй, Сүмтэй холбогдоно уу.','Terjadi masalah saat memeriksa persetujuan setelah verifikasi. Jangan membayar dua kali; hubungi gereja.');
add('닫기 ×','ပိတ်ရန် ×','Pat ×','Đóng ×','Хаах ×','Tutup ×');
add('헌금 종류','အလှူ အမျိုးအစား','Hkungga baw','Loại dâng hiến','Өргөлийн төрөл','Jenis persembahan');
add('헌금 금액','အလှူ ပမာဏ','Hkungga amount','Số tiền dâng','Өргөлийн дүн','Jumlah persembahan');
add('직접 입력','ပမာဏ ရိုက်ထည့်ရန်','Amount ka','Nhập số tiền','Дүн оруулах','Masukkan jumlah');
add('계좌이체','ဘဏ်လွှဲ','Bank transfer','Chuyển khoản','Банкны шилжүүлэг','Transfer bank');
add('십일조·주일헌금','ဆယ်ဖို့တစ်ဖို့ · တနင်္ဂနွေ အလှူ','Tithe · Sunday hkungga','Phần mười · Dâng hiến Chúa nhật','Аравны нэг · Нямын өргөл','Persepuluhan · Persembahan Minggu');
add('선교헌금','သာသနာ အလှူ','Mission hkungga','Dâng hiến truyền giáo','Илгээлтийн өргөл','Persembahan misi');
add('계좌 복사','အကောင့် နံပါတ် ကူးရန်','Account copy','Sao chép tài khoản','Данс хуулах','Salin rekening');
add('복사 완료','ကူးပြီး','Copy ngut sai','Đã sao chép','Хуулсан','Tersalin');

function locale(){
  const requested=new URLSearchParams(location.search).get('lang');
  const raw=String(requested||window.EKODIUserLanguage?.getLocale?.()||document.documentElement.dataset.ekodiLocale||document.documentElement.lang||'');
  return LANGS.has(raw)?raw:'';
}
function translate(source){
  const lang=locale();
  return lang?(M[source]?.[lang]||source):source;
}
function translateText(root=document.body){
  const lang=locale();
  if(!lang||!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    const parent=node.parentElement;
    if(!parent||parent.closest('script,style,template,noscript,[data-ekodi-language-control]'))continue;
    const raw=node.nodeValue||'';
    const source=raw.trim();
    const next=M[source]?.[lang];
    if(!next)continue;
    const lead=raw.match(/^\s*/)?.[0]||'';
    const tail=raw.match(/\s*$/)?.[0]||'';
    node.nodeValue=`${lead}${next}${tail}`;
  }
  root.querySelectorAll?.('[aria-label],[title],[placeholder]').forEach(el=>{
    for(const name of ['aria-label','title','placeholder']){
      const source=String(el.getAttribute(name)||'').trim();
      const next=M[source]?.[lang];
      if(next)el.setAttribute(name,next);
    }
  });
}
let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;translateText();});}
window.EKODIChurchPaymentI18n=Object.freeze({refresh:schedule,t:translate,getLocale:locale});
window.dispatchEvent(new CustomEvent('ekodi:church-payment-i18n-ready',{detail:{locale:locale()}}));
window.addEventListener('ekodi:locale-change',schedule);
window.addEventListener('ekodi:church-extended-i18n-applied',schedule);
window.addEventListener('ekodi:church-i18n-applied',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
new MutationObserver(()=>translateText()).observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder']});
})();
