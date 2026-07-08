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
    if(!slides.length) return;
    let idx=Array.from(slides).findIndex(slide=>slide.classList.contains('active')), timer;
    if(idx < 0) idx = 0;
    dots.forEach((dot,i)=>{
      if(!dot.getAttribute('type')) dot.setAttribute('type','button');
      if(!dot.getAttribute('aria-label')) dot.setAttribute('aria-label',`切换到第 ${i + 1} 张`);
    });
    let interval = root.dataset.autoplay !== undefined ? Number(root.dataset.autoplay) : 5000;
    if(!Number.isFinite(interval)) interval = 5000;
    function go(n){
      idx=(n+slides.length)%slides.length;
      slides.forEach((slide,i)=>slide.classList.toggle('active',i===idx));
      dots.forEach((dot,i)=>dot.classList.toggle('active',i===idx));
    }
    dots.forEach((d,i)=>d.addEventListener('click',()=>{go(i);reset()}));
    function reset(){
      clearInterval(timer);
      if(interval>0 && slides.length>1) timer=setInterval(()=>go(idx+1), interval);
    }
    go(idx);
    reset();
  });
})();
