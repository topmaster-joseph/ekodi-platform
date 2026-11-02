(()=>{
'use strict';
if(window.__EKODI_CHURCH_EXTENDED_I18N__)return;
window.__EKODI_CHURCH_EXTENDED_I18N__=true;

const NEW=new Set(['my','kac','vi','mn','id']);
const ORDER=['my','kac','vi','mn','id'];
const CHURCH_LANGUAGES=[
  ['ko-KR','한국어'],['en','English'],['zh-CN','中文'],['ja','日本語'],
  ['my','မြန်မာ'],['kac','Jinghpaw'],['vi','Tiếng Việt'],['mn','Монгол'],['id','Bahasa']
];
const META={
  my:{title:'EKODI အသင်းတော် | Ekklesia · Koinonia · Diaspora · Jubilee',description:'EKODI အသင်းတော်သည် ဘုရားသခင်၏ ခေါ်တော်မူခြင်း၊ မိတ်သဟာယ၊ သက်သေခံခြင်းနှင့် လွတ်မြောက်ခြင်း၊ ပြန်လည်ထူထောင်ခြင်းကို အသက်ရှင်ဖော်ပြသော အသိုင်းအဝိုင်းဖြစ်သည်။'},
  kac:{title:'EKODI Nawku Htingnu | Ekklesia · Koinonia · Diaspora · Jubilee',description:'EKODI Nawku Htingnu gaw Karai Kasang a shaga la ai hpung, rau nga ai hpung, mungkan de sakse hkrung nga ai hpung rai nna, lawt lu ai hte hkrang shawng lu ai asak hpe hkrung nga ai.'},
  vi:{title:'Hội thánh EKODI | Ekklesia · Koinonia · Diaspora · Năm Hân Hỉ',description:'Hội thánh EKODI là cộng đồng được kêu gọi, hiệp thông trong Đức Chúa Trời, làm chứng giữa đời và sống sự tự do, phục hồi của Năm Hân Hỉ.'},
  mn:{title:'EKODI Сүм | Ekklesia · Koinonia · Diaspora · Иовел',description:'EKODI Сүм бол Бурханд дуудагдсан, нөхөрлөлөөр нэгдсэн, дэлхийд гэрчлэгчээр илгээгдсэн, эрх чөлөө ба сэргэлтийг амьдралаар харуулдаг хамт олон.'},
  id:{title:'Gereja EKODI | Ekklesia · Koinonia · Diaspora · Yobel',description:'Gereja EKODI adalah komunitas yang dipanggil, dipersatukan dalam persekutuan dengan Allah, diutus menjadi saksi, dan menghidupi kebebasan serta pemulihan Yobel.'}
};

const P={};
function add(ko,my,kac,vi,mn,id){P[ko]={my,kac,vi,mn,id};}
add('에코디교회 홈','ပင်မစာမျက်နှာ','EKODI Nawku Htingnu home','Trang chủ Hội thánh EKODI','EKODI Сүмийн нүүр','Beranda Gereja EKODI');
add('메뉴 열기','မီနူးဖွင့်ရန်','Menu hpaw','Mở menu','Цэс нээх','Buka menu');
add('주요 메뉴','အဓိက မီနူး','Main menu','Menu chính','Үндсэн цэс','Menu utama');
add('예배안내','ဝတ်ပြုခြင်း','Nawku','Thờ phượng','Мөргөл','Ibadah');
add('온라인','အွန်လိုင်း','Online','Trực tuyến','Онлайн','Online');
add('큐티인 신청','QTIN မှာယူရန်','QTIN Order','Đặt QTIN','QTIN захиалах','Pesan QTIN');
add('실시간 방송 시청','တိုက်ရိုက်ထုတ်လွှင့်မှု ကြည့်ရန်','Live yu u','Xem trực tiếp','Шууд үзэх','Tonton siaran langsung');
add('시청 종료','ကြည့်ရှုမှု ရပ်ရန်','Yu ai hpe jahkring u','Dừng xem','Үзэхээ зогсоох','Berhenti menonton');
add('실시간 방송 준비','တိုက်ရိုက်ထုတ်လွှင့်မှု ပြင်ဆင်ရန်','Live jahta na hpe hkyen lajang u','Chuẩn bị phát trực tiếp','Шууд дамжуулалт бэлтгэх','Siapkan siaran langsung');
add('별도 화면에서 시청','သီးခြားမျက်နှာပြင်တွင် ကြည့်ရန်','Kaga sumla hta yu u','Xem ở cửa sổ riêng','Тусдаа цонхонд үзэх','Tonton di jendela terpisah');
add('에코디교회 실시간 방송 영상','EKODI အသင်းတော် တိုက်ရိုက်ထုတ်လွှင့်မှု ဗီဒီယို','EKODI Nawku Htingnu live video','Video phát trực tiếp của Hội thánh EKODI','EKODI Сүмийн шууд дамжуулалтын бичлэг','Video siaran langsung Gereja EKODI');
add('전체화면','မျက်နှာပြင်အပြည့်','Sumla tup','Toàn màn hình','Бүтэн дэлгэц','Layar penuh');
add('전체화면 종료','မျက်နှာပြင်အပြည့်မှ ထွက်ရန်','Sumla tup kaw na pru u','Thoát toàn màn hình','Бүтэн дэлгэцээс гарах','Keluar layar penuh');
add('공개 방송은 로그인 없이 볼 수 있습니다.','အများသုံး ထုတ်လွှင့်မှုကို အကောင့်ဝင်စရာမလိုဘဲ ကြည့်နိုင်သည်။','Masha yong yu lu ai live hpe login n galaw ai sha yu lu ai.','Có thể xem buổi phát công khai mà không cần đăng nhập.','Нээлттэй дамжуулалтыг нэвтрэхгүйгээр үзэж болно.','Siaran publik dapat ditonton tanpa masuk.');
add('방송 시청을 누르면 이곳에서 바로 재생됩니다.','တိုက်ရိုက်ကြည့်ရန်ကို နှိပ်လျှင် ဤနေရာတွင် ချက်ချင်း ပြသပါမည်။','Live yu u hpe dip yang ndai kaw hkra jahta na ra ai.','Nhấn Xem trực tiếp để phát ngay tại đây.','Шууд үзэх дээр дарвал энд шууд тоглоно.','Tekan Tonton siaran langsung untuk memutarnya di sini.');
add('실시간 방송을 연결하고 있습니다. 방송 중이 아니면 대기 안내가 표시됩니다.','တိုက်ရိုက်ထုတ်လွှင့်မှုနှင့် ချိတ်ဆက်နေသည်။ ထုတ်လွှင့်မှုမရှိပါက စောင့်ဆိုင်းရန် အသိပေးချက် ပြပါမည်။','Live hte matut taw nga ai. Live n nga yang la na matu shiga madun na.','Đang kết nối buổi phát trực tiếp. Nếu chưa phát, thông báo chờ sẽ hiển thị.','Шууд дамжуулалтад холбогдож байна. Дамжуулалт байхгүй бол хүлээх мэдэгдэл гарна.','Menghubungkan siaran langsung. Jika belum siaran, pemberitahuan tunggu akan muncul.');
add('전체화면이 지원되지 않습니다. 별도 화면에서 시청할 수 있습니다.','မျက်နှာပြင်အပြည့် မပံ့ပိုးပါ။ သီးခြားမျက်နှာပြင်တွင် ကြည့်နိုင်သည်။','Sumla tup n lu ai. Kaga sumla hta yu lu ai.','Không hỗ trợ toàn màn hình. Bạn có thể xem ở cửa sổ riêng.','Бүтэн дэлгэц дэмжигдэхгүй. Тусдаа цонхонд үзэж болно.','Layar penuh tidak didukung. Anda dapat menonton di jendela terpisah.');
add('전체화면 전환이 제한되었습니다. 별도 화면에서 시청할 수 있습니다.','မျက်နှာပြင်အပြည့်သို့ ပြောင်းခြင်းကို ကန့်သတ်ထားသည်။ သီးခြားမျက်နှာပြင်တွင် ကြည့်နိုင်သည်။','Sumla tup de galai na hpe pat da ai. Kaga sumla hta yu lu ai.','Chuyển toàn màn hình bị chặn. Bạn có thể xem ở cửa sổ riêng.','Бүтэн дэлгэц рүү шилжихийг хязгаарласан. Тусдаа цонхонд үзэж болно.','Beralih ke layar penuh dibatasi. Anda dapat menonton di jendela terpisah.');
add('함께하기','အတူပါဝင်ရန်','Rau Lawm U','Cùng đồng hành','Хамтдаа','Bergabung');
add('기도·후원·협력으로 함께하기 →','ဆုတောင်းခြင်း၊ ထောက်ပံ့ခြင်း၊ ပူးပေါင်းခြင်းဖြင့် အတူပါဝင်ရန် →','Akyu hpyi, garum, rau galaw hte rau lawm u →','Đồng hành qua cầu nguyện, dâng hiến và hợp tác →','Залбирал, хандив, хамтын ажиллагаагаар нэгдэх →','Bergabung lewat doa, dukungan, dan kemitraan →');
add('매일묵상','နေ့စဉ်ဆင်ခြင်ခြင်း','Daily Devotion','Tĩnh nguyện hằng ngày','Өдөр тутмын бясалгал','Renungan Harian');
add('말씀으로 오늘 읽기','ယနေ့ကို နှုတ်ကပတ်တော်ဖြင့် ဖတ်ရန်','Dai ni hpe Mungga hte hti','Đọc hôm nay qua Lời Chúa','Өнөөдрийг Үгээр унших','Membaca hari ini melalui Firman');
add('말씀이 오늘의 삶을 해석하게 합니다.','နှုတ်ကပတ်တော်က ယနေ့ဘဝကို အဓိပ္ပာယ်ဖွင့်စေသည်။','Mungga gaw dai ni asak hpe hkrang shapraw shangun ai.','Hãy để Lời Chúa soi nghĩa cho đời sống hôm nay.','Үг өнөөдрийн амьдралыг тайлбарлана.','Biarkan Firman menafsirkan kehidupan hari ini.');
add('묵상 · 해석 · 한 걸음','ဆင်ခြင်ခြင်း · အဓိပ္ပာယ်ဖွင့်ခြင်း · ခြေလှမ်းတစ်လှမ်း','Myit yu · hkrang hti · lagaw langai','Suy niệm · Giải nghĩa · Một bước','Бясалгал · Тайлбар · Нэг алхам','Renungan · Tafsir · Satu langkah');
add('지금 연결하기','ယခု ချိတ်ဆက်ရန်','Ya aten matut','Kết nối ngay','Одоо холбогдох','Terhubung sekarang');
add('예배와 교제는 일상 속에서 계속됩니다.','ဝတ်ပြုခြင်းနှင့် မိတ်သဟာယသည် နေ့စဉ်ဘဝထဲတွင် ဆက်လက်နေသည်။','Nawku hte htinghpaw gaw shani shagu asak hta matut nga ai.','Sự thờ phượng và thông công tiếp diễn trong đời sống hằng ngày.','Мөргөл ба нөхөрлөл өдөр тутмын амьдралд үргэлжилнэ.','Ibadah dan persekutuan berlanjut dalam keseharian.');
add('실시간 소통과 온라인 예배 →','တိုက်ရိုက် မိတ်သဟာယနှင့် အွန်လိုင်း ဝတ်ပြုခြင်း →','Live htinghpaw hte online nawku →','Giao lưu trực tiếp và thờ phượng online →','Шууд харилцаа ба онлайн мөргөл →','Persekutuan langsung dan ibadah online →');
add('방송하기','တိုက်ရိုက်ထုတ်လွှင့်ရန်','Live nhtoi','Phát sóng','Шууд дамжуулах','Siaran');
add('참여하기','ပါဝင်ရန်','Shang lawm','Tham gia','Оролцох','Ikut');
add('에코디교회 온라인 연결','EKODI အသင်းတော် အွန်လိုင်း','EKODI online matut mahkai','Kết nối trực tuyến Hội thánh EKODI','EKODI Сүм онлайн','Gereja EKODI online');
add('온라인 바로가기','အွန်လိုင်း လင့်ခ်များ','Online lam ni','Lối tắt trực tuyến','Онлайн холбоосууд','Akses online');
add('오시는 길','လာရောက်ရန်','Sa wa lam','Đường đến','Ирэх зам','Petunjuk arah');
add('부르심에서 교제로,','ခေါ်တော်မူခြင်းမှ မိတ်သဟာယသို့၊','Shaga la ai kaw na rau nga ai de,','Từ lời kêu gọi đến sự thông công,','Дуудлагаас нөхөрлөл рүү,','Dari panggilan menuju persekutuan,');
add('말씀으로 삶을 읽고,','နှုတ်ကပတ်တော်ဖြင့် အသက်တာကို ဖတ်ရှုပြီး၊','Mungga hte asak hpe hti nna,','đọc cuộc sống qua Lời Chúa,','Үгээр амьдралаа уншиж,','membaca hidup melalui firman,');
add('함께 살아내고 증언합니다','အတူတကွ အသက်ရှင်ပြီး သက်သေခံကြသည်','rau hkrung nna sakse madun ga ai','cùng sống và làm chứng','хамтдаа амьдруулж, гэрчилнэ','menghidupinya bersama dan bersaksi');
add('교제에서 세상으로','မိတ်သဟာယမှ ကမ္ဘာသို့','rau nga ai kaw na mungkan de','dari persekutuan bước ra thế giới','нөхөрлөлөөс дэлхий рүү','dari persekutuan menuju dunia');
add('세상에서 구별된 에클레시아,','လောကထဲမှ ခေါ်ထုတ်ထားသော Ekklesia၊','Mungkan kaw na shaga la ai Ekklesia,','Ekklesia được gọi ra khỏi thế gian,','Дэлхийгээс дуудагдсан Ekklesia,','Ekklesia yang dipanggil keluar dari dunia,');
add('하나님과 하나된 코이노니아, 세상 속에 증인된 디아스포라.','ဘုရားသခင်၌ တစ်လုံးတစ်ဝတည်းဖြစ်သော Koinonia၊ လောကထဲတွင် သက်သေဖြစ်သော Diaspora။','Karai Kasang hte rau ai Koinonia, mungkan hta sakse tai ai Diaspora.','Koinonia hiệp một trong Đức Chúa Trời, Diaspora làm chứng giữa đời.','Бурхантай нэгдсэн Koinonia, дэлхийд гэрчлэгч Diaspora.','Koinonia yang bersatu dalam Allah, Diaspora yang menjadi saksi di dunia.');
add('그리고 자유와 회복을 삶으로 살아내는 희년.','လွတ်မြောက်ခြင်းနှင့် ပြန်လည်ထူထောင်ခြင်းကို အသက်ရှင်ဖော်ပြသော Jubilee။','Lawt lu ai hte hkrang shawng lu ai hpe asak hta madun ai Jubilee.','Và Năm Hân Hỉ, sống sự tự do và phục hồi mỗi ngày.','Мөн эрх чөлөө, сэргэлтийг амьдралд хэрэгжүүлэх Иовел.','Dan Yobel, menghidupi kebebasan dan pemulihan dalam keseharian.');
add('그리고 자유와 회복을 일상과 관계 안에서 살아내는 희년.','နေ့စဉ်ဘဝနှင့် ဆက်ဆံရေးအတွင်း လွတ်မြောက်ခြင်းနှင့် ပြန်လည်ထူထောင်ခြင်းကို အသက်ရှင်ဖော်ပြသော Jubilee။','Hte lawt lu ai hte hkrang shawng lu ai hpe shani shagu asak hte matut mahkai hta hkrung nga ai Jubilee.','Và Năm Hân Hỉ, sống sự tự do và phục hồi trong đời sống hằng ngày và các mối quan hệ.','Мөн өдөр тутмын амьдрал ба харилцаанд эрх чөлөө, сэргэлтийг амьдран хэрэгжүүлэх Иовел.','Dan Yobel, menghidupi kebebasan dan pemulihan dalam keseharian dan relasi.');
add('홈페이지 전체 메뉴','စာမျက်နှာ အပိုင်းများ','Website hta na lam ni','Các phần của trang','Сайтын хэсгүүд','Bagian situs');
add('교회 소개','အသင်းတော်အကြောင်း','Nawku Htingnu lam','Giới thiệu','Сүмийн тухай','Tentang gereja');
add('예배 안내','ဝတ်ပြုချိန်','Nawku lam','Thông tin thờ phượng','Мөргөлийн мэдээлэл','Panduan ibadah');
add('시간과 장소','အချိန်နှင့် နေရာ','Aten hte shara','Thời gian & địa điểm','Цаг ба газар','Waktu & tempat');
add('말씀','နှုတ်ကပတ်တော်','Mungga','Sứ điệp','Үг','Firman');
add('복음 메시지','ဧဝံဂေလိ သတင်းစကား','Chyeju mungga','Sứ điệp Phúc Âm','Сайн мэдээний үг','Pesan Injil');
add('공동체','အသိုင်းအဝိုင်း','Hpung','Cộng đồng','Нийгэмлэг','Komunitas');
add('교회·선교·찬양','အသင်းတော် · သာသနာ · ချီးမွမ်းခြင်း','Nawku Htingnu · Mission · Shakawn','Hội thánh · Truyền giáo · Ngợi khen','Сүм · Илгээлт · Магтаал','Gereja · Misi · Pujian');
add('예배·묵상·실시간 화상','ဝတ်ပြုခြင်း · ဆင်ခြင်ခြင်း · တိုက်ရိုက်ဗီဒီယို','Nawku · Myit yu · Live','Thờ phượng · Suy niệm · Trực tiếp','Мөргөл · Бясалгал · Шууд видео','Ibadah · Renungan · Video langsung');
add('주소와 연락처','လိပ်စာနှင့် ဆက်သွယ်ရန်','Shara hte matut mahkai','Địa chỉ & liên hệ','Хаяг ба холбоо','Alamat & kontak');
add('믿음으로 고백하고','ယုံကြည်ခြင်းဖြင့် ဝန်ခံပြီး','Kam sham ai hte yin la nna','Tuyên xưng bằng đức tin','Итгэлээр тунхаглаж','Mengaku dengan iman');
add('삶으로','အသက်တာဖြင့်','asak hte','bằng đời sống','амьдралаар','melalui hidup');
add('응답하는','တုံ့ပြန်သော','htang ai','đáp lại','хариулдаг','menjawab');
add('교회','အသင်းတော်','Nawku Htingnu','Hội thánh','Сүм','gereja');
add('에코디교회','EKODI အသင်းတော်','EKODI Nawku Htingnu','Hội thánh EKODI','EKODI Сүм','Gereja EKODI');
add('에코디교회는 삼위일체 하나님께서 우리를 세상으로부터 불러 모으시고, 하나님과 성도의 깊은 교제를 누리게 하시며, 다시 세상으로 보내 복음의 증인이 되게 하심을 믿습니다.','EKODI အသင်းတော်သည် သုံးပါးတစ်ဆူ ဘုရားသခင်က ကျွန်ုပ်တို့ကို လောကထဲမှ ခေါ်ယူစုဝေးစေပြီး ဘုရားသခင်နှင့် ယုံကြည်သူများကြား နက်ရှိုင်းသော မိတ်သဟာယကို ပေးကာ ဧဝံဂေလိသက်သေများအဖြစ် လောကသို့ ပြန်လည်စေလွှတ်တော်မူသည်ကို ယုံကြည်သည်။','EKODI Nawku Htingnu gaw Karai Kasang anhte hpe mungkan kaw na shaga la nna, Karai Kasang hte rau htinghpaw nga shangun ai hte, chyeju mungga a sakse ni tai na mungkan de bai dat ai hpe kam sham ai.','Hội thánh EKODI tin rằng Đức Chúa Trời Ba Ngôi gọi chúng ta ra khỏi thế gian, cho chúng ta hiệp thông sâu sắc với Ngài và với nhau, rồi sai chúng ta trở lại thế gian làm chứng cho Phúc Âm.','EKODI Сүм Гурвал Бурхан биднийг дэлхийгээс дуудан цуглуулж, Бурхан болон итгэгчдийн гүн нөхөрлөлийг эдлүүлээд, Сайн мэдээний гэрч болгон дэлхий рүү дахин илгээдэг гэдэгт итгэдэг.','Gereja EKODI percaya bahwa Allah Tritunggal memanggil kita keluar dari dunia, membawa kita ke dalam persekutuan yang dalam dengan-Nya dan sesama, lalu mengutus kita kembali sebagai saksi Injil.');
add('그리고 희년의 복음 안에서 자유와 회복이 관계와 삶, 공동체의 자리까지 흘러가도록 살아냅니다.','Jubilee ဧဝံဂေလိအတွင်း လွတ်မြောက်ခြင်းနှင့် ပြန်လည်ထူထောင်ခြင်းသည် ဆက်ဆံရေး၊ နေ့စဉ်ဘဝနှင့် အသိုင်းအဝိုင်းထဲသို့ စီးဆင်းစေရန် အသက်ရှင်ကြသည်။','Jubilee chyeju mungga hta lawt lu ai hte hkrang shawng lu ai gaw matut mahkai, asak hte hpung de du hkra anhte hkrung nga ga ai.','Trong Phúc Âm của Năm Hân Hỉ, chúng tôi sống để sự tự do và phục hồi tuôn chảy vào các mối quan hệ, đời sống và cộng đồng.','Иовелийн Сайн мэдээнд эрх чөлөө ба сэргэлт харилцаа, өдөр тутмын амьдрал, хамт олонд урсан хүрэхээр амьдарна.','Dalam Injil Yobel, kami hidup agar kebebasan dan pemulihan mengalir ke relasi, kehidupan sehari-hari, dan komunitas.');
add('우리의 정체성에서 삶으로 →','ကျွန်ုပ်တို့၏ အမှတ်သညာမှ အသက်တာသို့ →','Anhte a identity kaw na asak de →','Từ căn tính đến đời sống →','Өөрийн мөн чанараас амьдрал руу →','Dari identitas menuju kehidupan →');
add('에클레시아','Ekklesia','Ekklesia','Ekklesia','Ekklesia','Ekklesia');
add('코이노니아','Koinonia','Koinonia','Koinonia','Koinonia','Koinonia');
add('디아스포라','Diaspora','Diaspora','Diaspora','Diaspora','Diaspora');
add('희년','Jubilee','Jubilee','Năm Hân Hỉ','Иовел','Yobel');
add('함께 드리는 예배','အတူတကွ ဝတ်ပြုခြင်း','Rau nawku','Cùng thờ phượng','Хамтдаа мөргөх','Beribadah bersama');
add('일주일의 시작,','အပတ်စဉ်၏ အစတွင်၊','Nawku shani ningpawt,','Bắt đầu một tuần mới,','Долоо хоногийн эхэнд,','Di awal pekan,');
add('은혜 안에서','ကျေးဇူးတော်အတွင်း','chyeju hta','trong ân điển','нигүүлсэл дотор','dalam anugerah');
add('다시 시작합니다.','ပြန်လည်စတင်ကြသည်။','bai ningpawt ga ai.','chúng ta bắt đầu lại.','дахин эхэлнэ.','kita memulai lagi.');
add('주일예배','တနင်္ဂနွေ ဝတ်ပြုခြင်း','Sunday Nawku','Thờ phượng Chúa nhật','Нямын мөргөл','Ibadah Minggu');
add('매주 주일 오전 11:00','တနင်္ဂနွေတိုင်း မနက် 11:00','Sunday shagu 11:00 AM','Mỗi Chúa nhật · 11:00','Ням бүр · 11:00','Setiap Minggu · 11.00');
add('수요예배','ဗုဒ္ဓဟူး ဝတ်ပြုခြင်း','Wednesday Nawku','Thờ phượng thứ Tư','Лхагвагийн мөргөл','Ibadah Rabu');
add('매주 수요일 오후 7:00','ဗုဒ္ဓဟူးတိုင်း ည 7:00','Wednesday shagu 7:00 PM','Mỗi thứ Tư · 19:00','Лхагва бүр · 19:00','Setiap Rabu · 19.00');
add('새벽기도','မနက်အစော ဆုတောင်းခြင်း','Jahpawt akyu hpyi','Cầu nguyện sáng sớm','Өглөөний залбирал','Doa pagi');
add('매일 오전 6:00','နေ့တိုင်း မနက် 6:00','Shani shagu 6:00 AM','Mỗi ngày · 06:00','Өдөр бүр · 06:00','Setiap hari · 06.00');
add('예배 문의','ဝတ်ပြုခြင်း မေးမြန်းရန်','Nawku contact','Liên hệ về thờ phượng','Мөргөлийн лавлагаа','Info ibadah');
add('본당','အဓိက ဝတ်ပြုခန်း','Nawku shara','Phòng thờ phượng chính','Үндсэн танхим','Ruang ibadah utama');
add('예배실','ဝတ်ပြုခန်း','Nawku gawk','Phòng thờ phượng','Мөргөлийн өрөө','Ruang ibadah');
add('복음으로 걷는 한 주','ဧဝံဂေလိနှင့် လျှောက်လှမ်းသော အပတ်','Chyeju mungga hte hkawm ai hop','Một tuần bước đi trong Phúc Âm','Сайн мэдээтэй хамт алхах долоо хоног','Sepekan berjalan dalam Injil');
add('교회 소식 보기 →','အသင်းတော် သတင်းများ →','Nawku Htingnu shiga →','Xem tin Hội thánh →','Сүмийн мэдээ →','Lihat kabar gereja →');
add('온라인 예배와 말씀 보기','အွန်လိုင်း ဝတ်ပြုခြင်းနှင့် နှုတ်ကပတ်တော် ကြည့်ရန်','Online nawku hte Mungga yu','Xem thờ phượng & sứ điệp trực tuyến','Онлайн мөргөл ба үгийг үзэх','Tonton ibadah & firman online');
add('예배에서 관계로, 관계에서 세상으로 이어집니다.','ဝတ်ပြုခြင်းမှ ဆက်ဆံရေးသို့၊ ဆက်ဆံရေးမှ လောကသို့ ဆက်သွားသည်။','Nawku kaw na matut mahkai de, dai kaw na mungkan de matut ai.','Từ thờ phượng đến các mối quan hệ, rồi từ các mối quan hệ bước ra thế giới.','Мөргөлөөс харилцаа руу, харилцаанаас дэлхий рүү үргэлжилнэ.','Dari ibadah menuju relasi, lalu dari relasi menuju dunia.');
add('복음은 우리 안에 머물지 않고 삶의 자리에서 회복의 열매가 됩니다.','ဧဝံဂေလိသည် ကျွန်ုပ်တို့အတွင်းမှာပဲ မနေရဘဲ နေ့စဉ်ဘဝထဲတွင် ပြန်လည်ထူထောင်ခြင်း၏ အသီးဖြစ်လာသည်။','Chyeju mungga gaw anhte hta sha n nga ai; asak hta hkrang shawng ai asi byin wa ai.','Phúc Âm không chỉ ở trong chúng ta mà kết trái phục hồi trong đời sống hằng ngày.','Сайн мэдээ бидний дотор үлдэхгүй, өдөр тутмын амьдралд сэргэлтийн үр жимс болно.','Injil tidak berhenti di dalam diri kita, tetapi berbuah menjadi pemulihan dalam kehidupan.');
add('에코디커뮤니티','EKODI ကွန်မြူနတီ','EKODI Community','Cộng đồng EKODI','EKODI Нийгэмлэг','Komunitas EKODI');
add('함께찬양하는사람들','အတူတကွ ချီးမွမ်းသူများ','Rau Shakawn Ai Ni','Những người cùng ngợi khen','Хамтдаа магтагчид','Orang yang memuji bersama');
add('흩어져 있어도,','ကွဲကွာနေသော်လည်း၊','Gara shara rai tim,','Dù ở xa nhau,','Хол байсан ч,','Walau terpencar,');
add('말씀과 교제로 연결됩니다.','နှုတ်ကပတ်တော်နှင့် မိတ်သဟာယအားဖြင့် ဆက်သွယ်ထားကြသည်။','Mungga hte htinghpaw hku matut nga ga ai.','chúng ta vẫn kết nối qua Lời Chúa và sự thông công.','Үг ба нөхөрлөлөөр холбогдоно.','kita tetap terhubung melalui firman dan persekutuan.');
add('유튜브 예배','YouTube ဝတ်ပြုခြင်း','YouTube Nawku','Thờ phượng trên YouTube','YouTube мөргөл','Ibadah YouTube');
add('지난 예배와 말씀을 한 자리에서 이어서 시청할 수 있습니다.','ယခင် ဝတ်ပြုခြင်းများနှင့် သတင်းစကားများကို တစ်နေရာတည်းတွင် ကြည့်နိုင်သည်။','Lai wa sai nawku hte Mungga ni hpe shara langai hta yu lu ai.','Xem lại các buổi thờ phượng và sứ điệp tại một nơi.','Өмнөх мөргөл, үгүүдийг нэг дор үзнэ.','Tonton kembali ibadah dan firman di satu tempat.');
add('묵상','ဆင်ခြင်ခြင်း','Myit yu','Suy niệm','Бясалгал','Renungan');
add('읽고','ဖတ်ပါ','Hti','Đọc','Унш','Baca');
add('묻고','မေးပါ','San','Hỏi','Асуух','Tanya');
add('살아내기','အသက်ရှင်ပါ','Hkrung','Hidupi','Амьдрал болгох','Hidupi');
add('오늘의 말씀으로','ယနေ့ နှုတ်ကပတ်တော်သို့','Dai ni Mungga de','Đến sứ điệp hôm nay','Өнөөдрийн үг рүү','Ke firman hari ini');
add('실시간 화상','တိုက်ရိုက်ဗီဒီယို မိတ်သဟာယ','Live video','Gặp mặt trực tuyến','Шууд видео нөхөрлөл','Persekutuan video langsung');
add('실시간 화상 참여','တိုက်ရိုက်ဗီဒီယိုတွင် ပါဝင်ရန်','Live video shang lawm','Tham gia video trực tiếp','Шууд видеод нэгдэх','Gabung video langsung');
add('브라우저에서 바로 참여할 수 있습니다.','ဘရောက်ဇာမှ တိုက်ရိုက် ပါဝင်နိုင်သည်။','Browser kaw na shang lawm lu ai.','Tham gia ngay trong trình duyệt.','Хөтчөөс шууд нэгдэнэ.','Bisa bergabung langsung dari browser.');
add('온라인 헌금','အွန်လိုင်း အလှူ','Online hkungga','Dâng hiến trực tuyến','Онлайн өргөл','Persembahan online');
add('계좌이체','ဘဏ်လွှဲ','Bank transfer','Chuyển khoản','Банкны шилжүүлэг','Transfer bank');
add('계좌 복사','အကောင့် နံပါတ် ကူးရန်','Account copy','Sao chép tài khoản','Данс хуулах','Salin rekening');
add('복사 완료','ကူးပြီး','Copy ngut sai','Đã sao chép','Хуулсан','Tersalin');
add('십일조·주일헌금','ဆယ်ဖို့တစ်ဖို့ · တနင်္ဂနွေ အလှူ','Tithe · Sunday hkungga','Phần mười · Dâng hiến Chúa nhật','Аравны нэг · Нямын өргөл','Persepuluhan · Persembahan Minggu');
add('선교헌금','သာသနာ အလှူ','Mission hkungga','Dâng hiến truyền giáo','Илгээлтийн өргөл','Persembahan misi');
add('함께 예배하고,','အတူတကွ ဝတ်ပြုပြီး၊','Rau nawku nna,','Cùng thờ phượng,','Хамтдаа мөргөж,','Beribadah bersama,');
add('함께 살아냅니다.','အတူတကွ အသက်ရှင်ကြသည်။','rau hkrung ga ai.','cùng sống điều mình tin.','хамтдаа амьдрал болгоно.','menghidupinya bersama.');
add('예배','ဝတ်ပြုခြင်း','Nawku','Thờ phượng','Мөргөл','Ibadah');
add('장소','နေရာ','Shara','Địa điểm','Байршил','Lokasi');
add('문의','ဆက်သွယ်ရန်','Matut mahkai','Liên hệ','Холбоо барих','Kontak');
add('오시는 길 보기 ↗','လမ်းညွှန် ကြည့်ရန် ↗','Sa wa lam yu ↗','Xem đường đi ↗','Зам харах ↗','Lihat petunjuk arah ↗');
add('온라인으로 먼저 만나기','အွန်လိုင်းမှ အရင်တွေ့မယ်','Online kaw shawng hkrum','Gặp chúng tôi online trước','Эхлээд онлайнаар уулзах','Temui kami online lebih dulu');
add('개인정보처리방침','ကိုယ်ရေးအချက်အလက် မူဝါဒ','Privacy Policy','Chính sách quyền riêng tư','Нууцлалын бодлого','Kebijakan Privasi');
add('이용약관','အသုံးပြုမှု စည်းကမ်းများ','Terms of Use','Điều khoản sử dụng','Үйлчилгээний нөхцөл','Ketentuan Penggunaan');
add('법적 고지','ဥပဒေဆိုင်ရာ အချက်အလက်','Legal information','Thông tin pháp lý','Хууль зүйн мэдээлэл','Informasi hukum');
add('맨 위로 ↑','အပေါ်သို့ ↑','Ntsa de ↑','Lên đầu trang ↑','Дээш ↑','Ke atas ↑');
add('닫기 ×','ပိတ်ရန် ×','Pat ×','Đóng ×','Хаах ×','Tutup ×');
add('헌금 종류','အလှူ အမျိုးအစား','Hkungga baw','Loại dâng hiến','Өргөлийн төрөл','Jenis persembahan');
add('헌금 금액','အလှူ ပမာဏ','Hkungga amount','Số tiền dâng','Өргөлийн дүн','Jumlah persembahan');
add('직접 입력','ပမာဏ ရိုက်ထည့်ရန်','Amount ka','Nhập số tiền','Дүн оруулах','Masukkan jumlah');
add('선택한 금액 결제하기','ရွေးထားသော ပမာဏ ပေးချေရန်','Lata da ai amount jaw','Thanh toán số tiền đã chọn','Сонгосон дүнг төлөх','Bayar jumlah terpilih');
add('예배자료 관리','ဝတ်ပြုကိုးကွယ်မှု စာရွက်စာတမ်းများ စီမံရန်','Nawku lam hpe up hkang','Quản lý tài liệu thờ phượng','Мөргөлийн материалыг удирдах','Kelola materi ibadah');

add('세상에서 구별된 에클레시아, 하나님과 하나된 코이노니아, 세상 속에 증인된 디아스포라.','လောကထဲမှ ခေါ်ထုတ်ထားသော Ekklesia၊ ဘုရားသခင်၌ တစ်လုံးတစ်ဝတည်းဖြစ်သော Koinonia၊ လောကထဲတွင် သက်သေဖြစ်သော Diaspora။','Mungkan kaw na shaga la ai Ekklesia, Karai Kasang hte rau ai Koinonia, mungkan hta sakse tai ai Diaspora.','Ekklesia được gọi ra khỏi thế gian, Koinonia hiệp một trong Đức Chúa Trời, Diaspora làm chứng giữa đời.','Дэлхийгээс дуудагдсан Ekklesia, Бурхантай нэгдсэн Koinonia, дэлхийд гэрчлэгч Diaspora.','Ekklesia yang dipanggil keluar dari dunia, Koinonia yang bersatu dalam Allah, Diaspora yang menjadi saksi di dunia.');
add('전체 소셜채널 ↗','လူမှုကွန်ရက်ချန်နယ်များအားလုံး ↗','Social channel yawng ↗','Tất cả kênh mạng xã hội ↗','Бүх сошиал сувгууд ↗','Semua kanal sosial ↗');

const DAILY={
  my:{ref:'ဂလာတိ 5:13',text:'အချင်းချင်း မေတ္တာဖြင့် အစေခံကြလော့။'},
  kac:{ref:'Galati 5:13',text:'Tsaw ra myit hte langai hte langai daw jau nga mu.'},
  vi:{ref:'Ga-la-ti 5:13',text:'Hãy lấy tình yêu thương mà phục vụ lẫn nhau.'},
  mn:{ref:'Галат 5:13',text:'Хайраар бие биедээ үйлчил.'},
  id:{ref:'Galatia 5:13',text:'Layanilah seorang akan yang lain oleh kasih.'}
};

let desired='ko-KR';
let fallback=new Map();
let fallbackAttrs=new Map();
let captured=false;
let capturing=false;
let scheduled=false;
let rerunRequested=false;

function normalize(value){
  const raw=String(value||'').trim().toLowerCase();
  if(raw==='my'||raw.startsWith('my-'))return'my';
  if(raw==='kac'||raw.startsWith('kac-')||raw==='jinghpaw'||raw==='kachin')return'kac';
  if(raw==='vi'||raw.startsWith('vi-'))return'vi';
  if(raw==='mn'||raw.startsWith('mn-'))return'mn';
  if(raw==='id'||raw.startsWith('id-'))return'id';
  return String(value||'');
}
function requestedUrlLocale(){const query=new URLSearchParams(location.search).get('lang');return query?normalize(query):'';}
function sharedLocale(){const requested=requestedUrlLocale();if(NEW.has(requested))return requested;return normalize(window.EKODIUserLanguage?.getLocale?.()||document.documentElement.dataset.ekodiLocale||document.documentElement.lang||'ko-KR');}
function ensureLanguageOptions(){
  const select=document.querySelector('[data-ekodi-language-control] select');
  if(!select)return false;
  const expected=CHURCH_LANGUAGES.map(([value,label])=>value+'\u0000'+label).join('\u0001');
  const actual=[...select.options].map(option=>option.value+'\u0000'+option.textContent.trim()).join('\u0001');
  if(actual!==expected){
    const fragment=document.createDocumentFragment();
    for(const [value,label] of CHURCH_LANGUAGES){const option=document.createElement('option');option.value=value;option.textContent=label;option.title=label;fragment.append(option);}
    select.replaceChildren(fragment);
  }
  const current=sharedLocale();
  if(CHURCH_LANGUAGES.some(([value])=>value===current)&&select.value!==current)select.value=current;
  return true;
}

function core(source,locale){
  const direct=P[source]?.[locale]||fallback.get(source);
  if(direct)return direct;
  const english=window.EKODIChurchI18n?.translate?.(source,'en');
  return english&&english!==source?english:source;
}
function captureFallback(){
  if(captured||capturing||!window.EKODIChurchI18n)return;
  capturing=true;
  const root=document.body||document.documentElement;
  const textPairs=[];
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    const parent=node.parentElement;
    const source=(node.nodeValue||'').trim();
    if(!parent||!source||parent.closest('script,style,template,noscript,[data-ekodi-language-control]'))continue;
    textPairs.push([node,source]);
  }
  const attrPairs=[];
  root.querySelectorAll('[aria-label],[title],[placeholder]').forEach(el=>{
    for(const name of ['aria-label','title','placeholder']){
      const source=el.getAttribute(name);
      if(source)attrPairs.push([el,name,source]);
    }
  });
  try{
    window.EKODIChurchI18n.setLocale('en');
    for(const [ref,source] of textPairs){const value=(ref.nodeValue||'').trim();if(value&&value!==source)fallback.set(source,value);}
    for(const [el,name,source] of attrPairs){const value=el.getAttribute(name);if(value&&value!==source)fallbackAttrs.set(`${name}\u0000${source}`,value);}
    window.EKODIChurchI18n.setLocale('ko-KR');
    captured=true;
  }finally{capturing=false;}
}
function applyHead(locale){
  const meta=META[locale];
  if(!meta)return;
  if(document.title!==meta.title)document.title=meta.title;
  const description=document.querySelector('meta[name="description"]');
  if(description&&description.getAttribute('content')!==meta.description)description.setAttribute('content',meta.description);
}
function applyText(locale){
  const root=document.body||document.documentElement;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    const parent=node.parentElement;
    if(!parent||parent.closest('script,style,template,noscript,[data-ekodi-language-control]'))continue;
    const raw=node.nodeValue||'';
    const source=raw.trim();
    if(!source||!/[가-힣]/.test(source))continue;
    const translated=core(source,locale);
    // Do not rewrite unknown Korean as the same string: MutationObserver would endlessly reschedule.
    if(translated===source)continue;
    const lead=raw.match(/^\s*/)?.[0]||'';
    const tail=raw.match(/\s*$/)?.[0]||'';
    node.nodeValue=`${lead}${translated}${tail}`;
  }
  root.querySelectorAll('[aria-label],[title],[placeholder]').forEach(el=>{
    for(const name of ['aria-label','title','placeholder']){
      const source=el.getAttribute(name);
      if(!source||!/[가-힣]/.test(source))continue;
      el.setAttribute(name,P[source]?.[locale]||fallbackAttrs.get(`${name}\u0000${source}`)||fallback.get(source)||source);
    }
  });
}
function applyDaily(locale){
  const entry=DAILY[locale];
  if(!entry)return;
  const box=document.querySelector('.daily-verse');
  const text=box?.querySelector('.daily-verse-text');
  const ref=box?.querySelector('.daily-verse-ref');
  if(text&&text.textContent!==`“${entry.text}”`)text.textContent=`“${entry.text}”`;
  if(ref&&ref.textContent!==entry.ref)ref.textContent=entry.ref;
  if(box){const nextTitle=`${entry.text} · ${entry.ref}`,nextAria=`${entry.text}, ${entry.ref}`;if(box.title!==nextTitle)box.title=nextTitle;if(box.getAttribute('aria-label')!==nextAria)box.setAttribute('aria-label',nextAria);}
}
function apply(locale=desired){
  if(capturing)return;
  desired=normalize(locale);
  if(!NEW.has(desired))return;
  captureFallback();
  if(document.documentElement.lang!==desired)document.documentElement.lang=desired;
  if(document.documentElement.dataset.ekodiLocale!==desired)document.documentElement.dataset.ekodiLocale=desired;
  applyHead(desired);
  applyText(desired);
  applyDaily(desired);
  window.dispatchEvent(new CustomEvent('ekodi:church-extended-i18n-applied',{detail:{locale:desired}}));
}
function schedule(){if(capturing||scheduled){rerunRequested=true;return;}scheduled=true;requestAnimationFrame(()=>{scheduled=false;ensureLanguageOptions();const shared=sharedLocale();if(NEW.has(shared))desired=shared;apply(desired);if(rerunRequested){rerunRequested=false;schedule();}});}

window.EKODIChurchExtendedI18n=Object.freeze({supported:ORDER,getLocale:()=>desired,refresh:schedule});
window.addEventListener('ekodi:locale-change',event=>{desired=normalize(event.detail?.locale||sharedLocale());if(NEW.has(desired))schedule();});
window.addEventListener('ekodi:church-i18n-applied',()=>{if(NEW.has(sharedLocale()))schedule();});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{desired=sharedLocale();schedule();},{once:true});else{desired=sharedLocale();schedule();}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();