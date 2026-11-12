// 在 <head> 里同步加载、最先执行：给 <html> 打标记，供 CSS 做渐进增强。
//   .js          JS 可用：才启用“滚动到才出现”等需要脚本配合的效果；JS 失败时内容照常可见
//   .intro-seen  本次会话已经看过首页入场动画，不再重播
(function (d) {
  d.classList.add("js");
  try { if (sessionStorage.getItem("lizhi.intro")) d.classList.add("intro-seen"); } catch (e) { /* 隐私模式 */ }
})(document.documentElement);
