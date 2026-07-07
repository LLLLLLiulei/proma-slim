/* ============================================================
   Tab 导航高亮/平滑滚动 + 轮播逻辑
   使用方式：整段复制到 </body> 前的 <script> 标签内。
   若页面没有 Tab 导航，删除第一段 IIFE；没有轮播/滑动，删除第二段。
   ============================================================ */

/* ---- 1. Tab 导航：点击平滑滚动并高亮当前 tab ---- */
(()=>{
  const links=document.querySelectorAll('.tab-nav a[href^="#"]');
  if(!links.length) return;
  function setActive(id){
    links.forEach(a=>a.classList.toggle('active', a.getAttribute('href')==='#'+id));
  }
  links.forEach(a=>a.addEventListener('click',e=>{
    e.preventDefault();
    const target=document.querySelector(a.getAttribute('href'));
    if(target){ target.scrollIntoView({behavior:'smooth',block:'start'}); setActive(target.id); }
  }));
})();

/* ---- 2. 轮播（Hero轮播 .hero-carousel 与内容区轮播 .carousel 通用） ---- */
(()=>{
  document.querySelectorAll('.hero-carousel, .carousel').forEach(root=>{
    const dots=root.querySelectorAll('.hero-carousel__dots button, .carousel__dots button');
    const slides=root.querySelectorAll('.hero-carousel__slide, .carousel__slide');
    if(slides.length < 2) return;
    let idx=0, timer;
    const interval = root.dataset.autoplay !== undefined ? Number(root.dataset.autoplay) : 5000;
    if(interval <= 0) return;
    function go(n){
      slides[idx].classList.remove('active'); if(dots[idx]) dots[idx].classList.remove('active');
      idx=(n+slides.length)%slides.length;
      slides[idx].classList.add('active'); if(dots[idx]) dots[idx].classList.add('active');
    }
    dots.forEach((d,i)=>d.addEventListener('click',()=>{go(i);reset()}));
    function reset(){ clearInterval(timer); timer=setInterval(()=>go(idx+1), interval); }
    reset();
  });
})();