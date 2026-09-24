import{t as e}from"./gsap.Bi_c5vh2.js";import{t}from"./ScrollTrigger.BTGKJApg.js";import{t as n}from"./deviceInfo.eHzC_0c8.js";e.registerPlugin(t),document.addEventListener(`DOMContentLoaded`,()=>{let t=document.querySelector(`[data-welcome-section]`);if(!t)return;let r=t.querySelector(`[data-logo]`),i=t.querySelector(`[data-welcome-header]`),a=t.querySelector(`[data-cta]`),o=t.querySelector(`[data-hero-particles]`),s=t.querySelector(`[data-os-cta-container]`);if(s){let e=n.operatingSystem;s.innerHTML=`
        <a class="call-to-action button button-primary" href="/download">
          <span style="display: flex; align-items: center; gap: 8px;">
            ${e.name===`unknown`?``:`<span class="symbol" style="font-size: 20px;">${e.name===`mac`?`desktop_mac`:e.name===`windows`?`desktop_windows`:`terminal`}</span>`}
            Download${e.buttonText}
          </span>
        </a>
      `}let c=e.timeline();i&&i.helper&&(i.helper.initialize(),i.helper.startTyping(c)),c.from(r,{opacity:0,y:`1em`,duration:2,ease:`power2.out`}).from(a,{opacity:0,y:50,duration:2,ease:`power2.out`},`<`).from(o,{opacity:0,duration:4,ease:`power2.out`},`<`),e.to(o,{scrollTrigger:{trigger:t,start:`center top`,end:`bottom top`,scrub:!0,onUpdate:e=>{o.style.opacity=String(1-e.progress)}},opacity:0,ease:`power2.out`})});