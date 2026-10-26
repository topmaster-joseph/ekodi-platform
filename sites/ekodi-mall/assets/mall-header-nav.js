// Read-only buyer wishlist count on travel and weekly-picks pages.
(()=>{const count=document.getElementById('wishCount');if(!count)return;try{const wishes=JSON.parse(localStorage.getItem('ekodiMallWishes')||'[]');count.textContent=String(Array.isArray(wishes)?wishes.length:0)}catch{count.textContent='0'}})();
