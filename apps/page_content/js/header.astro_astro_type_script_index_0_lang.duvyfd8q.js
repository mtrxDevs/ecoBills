import{t as e}from"./gsap.Bi_c5vh2.js";var t=()=>{let t=document.querySelector(`[data-header]`);if(!t)return;let n=t.getAttribute(`data-scroll-reactive`)===`true`,r=t.querySelectorAll(`[data-dropdown-trigger]`),i=t.querySelectorAll(`[data-dropdown-panel-id]`),a=t.querySelector(`[data-dropdowns-container]`),o=document.querySelector(`[data-dropdown-overlay]`),s=t.querySelector(`[data-mobile-menu-toggle]`),c=t.querySelector(`[data-mobile-menu]`),l=t.querySelectorAll(`[data-mobile-dropdown-trigger]`),u=t.querySelectorAll(`[data-mobile-dropdown-panel]`),d=window.scrollY,f=!1,p=null;n&&window.addEventListener(`scroll`,()=>{if(f||t.classList.contains(`menu-open`))return;let e=window.scrollY;e>0?t.classList.add(`scrolled`):t.classList.remove(`scrolled`);let n=e-d;n>5?(t.classList.add(`hidden`),_(),g()):n<-5&&t.classList.remove(`hidden`),Math.abs(n)>5&&(d=e)});let m=t.querySelector(`[data-logo-link]`),h=t.querySelector(`[data-logo-context-menu]`),g=()=>{h&&(h.classList.remove(`visible`),h.setAttribute(`aria-hidden`,`true`))};if(m&&h){m.addEventListener(`contextmenu`,e=>{e.preventDefault(),e.stopPropagation(),h.classList.add(`visible`),h.setAttribute(`aria-hidden`,`false`)}),m.addEventListener(`click`,e=>{h.classList.contains(`visible`)&&e.preventDefault()}),window.addEventListener(`pointerdown`,e=>{let t=e.target;h.contains(t)||m.contains(t)||g()}),window.addEventListener(`scroll`,g,{passive:!0}),window.addEventListener(`keydown`,e=>{e.key===`Escape`&&g()});let e=h.querySelector(`[data-context-action="copy-logo"]`),t=h.querySelector(`[data-context-action="copy-wordmark"]`),n=e=>{e.classList.add(`copied`),setTimeout(()=>{e.classList.remove(`copied`),g()},1200)};e&&e.addEventListener(`click`,t=>{t.stopPropagation(),navigator.clipboard.writeText(`<svg viewBox="0 0 113 113" height="113" width="113" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M89.6992 93.695C94.3659 97.195 101.366 94.8617 94.9492 88.445C75.6992 69.7783 79.7825 18.445 55.8659 18.445C31.9492 18.445 36.0325 69.7783 16.7825 88.445C9.78251 95.445 17.3658 97.195 22.0325 93.695C40.1159 81.445 38.9492 59.8617 55.8659 59.8617C72.7825 59.8617 71.6159 81.445 89.6992 93.695Z" fill="#3186FF"/>
  <mask id="mask0_logo" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="13" y="18" width="85" height="78">
    <path d="M89.6992 93.695C94.3659 97.195 101.366 94.8617 94.9492 88.445C75.6992 69.7783 79.7825 18.445 55.8659 18.445C31.9492 18.445 36.0325 69.7783 16.7825 88.445C9.78251 95.445 17.3658 97.195 22.0325 93.695C40.1159 81.445 38.9492 59.8617 55.8659 59.8617C72.7825 59.8617 71.6159 81.445 89.6992 93.695Z" fill="black"/>
  </mask>
  <g mask="url(#mask0_logo)">
    <g filter="url(#filter0_logo)">
      <ellipse cx="22.7873" cy="26.8098" rx="22.7873" ry="26.8098" transform="matrix(-0.112784 0.99362 -0.99362 -0.112781 66.2473 -15.5344)" fill="#FFE432"/>
    </g>
    <g filter="url(#filter1_logo)">
      <ellipse cx="96.491" cy="35.1231" rx="29.5007" ry="30.1492" transform="rotate(76.9243 96.491 35.1231)" fill="#FC413D"/>
    </g>
    <g filter="url(#filter2_logo)">
      <ellipse cx="9.02988" cy="41.6647" rx="30.832" ry="39.9417" transform="rotate(74.1257 9.02988 41.6647)" fill="#00B95C"/>
    </g>
    <g filter="url(#filter3_logo)">
      <ellipse cx="11.2212" cy="42.8915" rx="30.22" ry="33.2695" transform="rotate(45.6065 11.2212 42.8915)" fill="#00B95C"/>
    </g>
    <g filter="url(#filter4_logo)">
      <ellipse cx="75.7546" cy="104.822" rx="29.0177" ry="27.943" transform="rotate(76.9243 75.7546 104.822)" fill="#3186FF"/>
    </g>
    <g filter="url(#filter5_logo)">
      <ellipse cx="33.5661" cy="35.4043" rx="33.5661" ry="35.4043" transform="matrix(-0.409539 0.912293 -0.912294 -0.409537 101.25 -15.1674)" fill="#FBBC04"/>
    </g>
    <g filter="url(#filter6_logo)">
      <path d="M2.56802 149.695C-15.8116 142.48 15.5987 83.1163 23.4093 63.2203C31.22 43.3244 52.4514 33.0447 70.831 40.26C89.2107 47.4753 110.996 87.2162 103.185 107.112C95.3742 127.008 20.9477 156.91 2.56802 149.695Z" fill="#3186FF"/>
    </g>
    <g filter="url(#filter7_logo)">
      <path d="M113.934 75.8079C109.013 81.5509 96.1724 78.6224 85.253 69.2667C74.3335 59.911 69.4704 47.6711 74.391 41.928C79.3116 36.185 92.1525 39.1136 103.072 48.4692C113.991 57.8249 118.855 70.0648 113.934 75.8079Z" fill="#749BFF"/>
    </g>
    <g filter="url(#filter8_logo)">
      <ellipse cx="92.611" cy="23.7962" rx="44.2411" ry="27.5016" transform="rotate(34.0763 92.611 23.7962)" fill="#FC413D"/>
    </g>
    <g filter="url(#filter9_logo)">
      <ellipse cx="23.4949" cy="29.5887" rx="23.7071" ry="13.7869" transform="rotate(112.516 23.4949 29.5887)" fill="#FFEE48"/>
    </g>
  </g>
  <defs>
    <filter id="filter0_logo" x="2.49348" y="-26.5423" width="69.0899" height="61.2525" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="3.89034" result="effect1_foregroundBlur"/>
    </filter>
    <filter id="filter1_logo" x="28.7524" y="-32.0333" width="135.477" height="134.313" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="18.8078" result="effect1_foregroundBlur"/>
    </filter>
    <filter id="filter2_logo" x="-62.2884" y="-21.9253" width="142.637" height="127.18" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="15.9884" result="effect1_foregroundBlur"/>
    </filter>
    <filter id="filter3_logo" x="-52.5697" y="-20.8346" width="127.582" height="127.452" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="15.9884" result="effect1_foregroundBlur"/>
    </filter>
    <filter id="filter4_logo" x="17.3619" y="45.4646" width="116.786" height="118.715" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="15.1937" result="effect1_foregroundBlur"/>
    </filter>
    <filter id="filter5_logo" x="-7.44765" y="-60.4737" width="125.303" height="122.858" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="13.7698" result="effect1_foregroundBlur"/>
    </filter>
    <filter id="filter6_logo" x="-27.7086" y="13.3597" width="157.119" height="162.029" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="12.297" result="effect1_foregroundBlur"/>
    </filter>
    <filter id="filter7_logo" x="50.4638" y="16.981" width="87.3973" height="83.7738" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="11.0036" result="effect1_foregroundBlur"/>
    </filter>
    <filter id="filter8_logo" x="34.2604" y="-28.457" width="116.701" height="104.506" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="9.29385" result="effect1_foregroundBlur"/>
    </filter>
    <filter id="filter9_logo" x="-15.1522" y="-15.9493" width="77.2941" height="91.076" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="11.5027" result="effect1_foregroundBlur"/>
    </filter>
  </defs>
</svg>`).then(()=>{n(e)})}),t&&t.addEventListener(`click`,e=>{e.stopPropagation();let r=m.querySelector(`svg`)?.outerHTML||``;navigator.clipboard.writeText(r).then(()=>{n(t)})})}r.forEach(n=>{let s=n.getAttribute(`data-dropdown-trigger`),c=()=>{if(!s){_();return}if(p===s)return;p=s,g(),i.forEach(e=>{e.classList.remove(`open`),e.getAttribute(`data-dropdown-panel-id`)===s&&e.classList.add(`open`)}),r.forEach(e=>{e.getAttribute(`data-dropdown-trigger`)===s?(e.classList.add(`dropdown-open`),e.setAttribute(`aria-expanded`,`true`)):(e.classList.remove(`dropdown-open`),e.setAttribute(`aria-expanded`,`false`))}),t.classList.add(`dropdown-open`),a.classList.add(`open`),o.classList.add(`open`);let n=a.querySelector(`[data-dropdown-panel-id="${s}"]`);if(n){let t=n.querySelectorAll(`.dropdown-title, .dropdown-info, .nav-button`),r=n.querySelectorAll(`.subnav-link`);e.timeline().set(t,{opacity:0,y:`1em`}).to(a,{duration:.3,height:`auto`,opacity:1,ease:`power2.out`}).to(t,{duration:.3,opacity:1,y:0,stagger:.08,ease:`power2.out`},`<`).fromTo(r,{y:`1em`,opacity:0},{y:0,opacity:1,stagger:.05,ease:`power2.out`},`<0.15`)}};n.addEventListener(`mouseenter`,c),n.addEventListener(`focus`,c),n.addEventListener(`click`,e=>{s&&(e.preventDefault(),c())})}),t.addEventListener(`mouseleave`,()=>{_(),g()}),o&&o.addEventListener(`click`,()=>{_(),g()});function _(){p=null,t.classList.remove(`dropdown-open`),a.classList.remove(`open`),o.classList.remove(`open`),i.forEach(e=>e.classList.remove(`open`)),r.forEach(e=>{e.classList.remove(`dropdown-open`),e.setAttribute(`aria-expanded`,`false`)})}s&&s.addEventListener(`click`,e=>{if(e.stopPropagation(),f=!f,f){t.classList.remove(`hidden`),t.classList.add(`menu-open`),c.classList.add(`open`),document.body.classList.add(`no-scroll`);let e=s.querySelector(`span`);e&&(e.textContent=`close`),g()}else v()});function v(){if(f=!1,t.classList.remove(`menu-open`),c.classList.remove(`open`),document.body.classList.remove(`no-scroll`),s){let e=s.querySelector(`span`);e&&(e.textContent=`menu`)}u.forEach(e=>e.classList.remove(`open`)),l.forEach(e=>e.classList.remove(`open`))}l.forEach(e=>{let t=e.getAttribute(`data-mobile-dropdown-trigger`);e.addEventListener(`click`,n=>{n.stopPropagation();let r=c.querySelector(`[data-mobile-dropdown-panel="${t}"]`);if(r){let t=r.classList.contains(`open`);r.classList.toggle(`open`,!t),e.classList.toggle(`open`,!t),e.setAttribute(`aria-expanded`,t?`false`:`true`)}})}),t.querySelectorAll(`.nav a, .mobile-menu a, .dropdown a, [data-logo-link]`).forEach(e=>{e.addEventListener(`click`,()=>{v(),_(),g()})})};document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,t):t();