// 极简断言框架（浏览器内，无 Node / Vitest）
// 被 tests/run.html 加载；各 test_*.js 用 HX.test(name, fn) 注册用例，HX.runTests(out) 渲染结果。
window.HX = window.HX || {};
(function () {
  const HX = window.HX;
  const results = [];

  HX.test = function (name, fn) {
    try {
      fn();
      results.push({ name: name, ok: true });
    } catch (e) {
      results.push({ name: name, ok: false, msg: e && e.message ? e.message : String(e) });
    }
  };

  HX.assert = function (cond, msg) {
    if (!cond) throw new Error(msg || 'assert failed');
    return true;
  };

  // 逐行着色：✓ 绿、✗ 红、汇总行按总结果着色。
  // 之前是给整个 <pre> 设一个 color —— 只要有 1 条失败，**连打勾的也一起变红**，
  // 看上去像"全错了"，反而看不出哪条真失败。
  const PASS_C = '#7ee787', FAIL_C = '#ff6b6b';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  HX.runTests = function (out) {
    let pass = 0, fail = 0;
    const lines = [];
    const failed = [];
    for (const r of results) {
      if (r.ok) { pass++; lines.push('✓ ' + r.name); }
      else { fail++; failed.push(r.name + ' — ' + r.msg); lines.push('✗ ' + r.name + ' — ' + r.msg); }
    }
    lines.push('');
    lines.push('通过 ' + pass + ' / ' + (pass + fail) + (fail ? '  ❌ 有失败' : '  ✅ 全绿'));

    if (out) {
      // 纯文本先写一份：无头校验脚本（Node 桩 / 控制台）按 textContent / lastRun 读取结果
      out.textContent = lines.join('\n');

      // 浏览器里再逐行着一次色。判据：能创建元素才走 HTML 分支，
      // 这样 Node 的桩元素（只有 textContent / style）不会被打断。
      const doc = out.ownerDocument;
      if (doc && doc.createElement) {
        out.innerHTML = lines.map(function (s) {
          if (s.charAt(0) === '✓') return '<span style="color:' + PASS_C + '">' + esc(s) + '</span>';
          if (s.charAt(0) === '✗') return '<span style="color:' + FAIL_C + '">' + esc(s) + '</span>';
          if (s.indexOf('通过 ') === 0) {
            return '<span style="color:' + (fail ? FAIL_C : PASS_C) + ';font-weight:700">' + esc(s) + '</span>';
          }
          return esc(s);
        }).join('\n');
      } else {
        out.style.color = fail ? FAIL_C : PASS_C;   // 降级：整体一色
      }
    }

    // 机器可读摘要：无头校验时 DOM dump 里的中文会乱码，只有 ASCII 才能直接判读。
    HX.lastRun = { pass: pass, fail: fail, total: pass + fail, failed: failed };
    if (typeof document !== 'undefined' && document.title !== undefined) {
      document.title = 'TESTS ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' OK');
    }
    return HX.lastRun;
  };
})();
