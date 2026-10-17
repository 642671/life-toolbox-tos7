"use strict";

var APP_ID = "life-toolbox";

/*
 * 平台代理地址。TOS 7 规范 8.9 把 /v2/proxy/<appid>/<api> 定为唯一形式，
 * 7.0.1298 实机验证它由 nginx 的 location ~ ^/v2/(.*) 去掉 /v2/ 后转给
 * 127.0.0.1:5050（TOSDaemon）。规范 8.7 又要求后端兼容
 * /v2/proxy/<appid>/api/<resource> 和 <config.ini.path>/<api_name>，个别固件
 * 确实只在带前缀的路径上放行代理。所以这里按顺序探测，选中第一个"回到本应用
 * JSON"的候选后复用。判据必须是回包内容而不是 HTTP 状态码：未登录时平台对任意
 * /v2/ 路径都回 200 + {"is_login":false,"code_num":117}，路径没命中时 nginx 回
 * 404 + HTML，两者都不是本应用。
 */
var API_CANDIDATES = (function buildCandidates() {
  var dir = location.pathname.slice(0, location.pathname.lastIndexOf("/") + 1);
  var list = [
    "/v2/proxy/" + APP_ID,
    "/v2/proxy/" + APP_ID + "/api",
    dir + "v2/proxy/" + APP_ID
  ];
  var unique = [];
  for (var i = 0; i < list.length; i += 1) {
    if (unique.indexOf(list[i]) < 0) {
      unique.push(list[i]);
    }
  }
  return unique;
})();

var API_ROOT = API_CANDIDATES[0];


function byId(id) {
  return document.getElementById(id);
}

function numberValue(id) {
  var value = Number.parseFloat(byId(id).value);
  return Number.isFinite(value) ? value : null;
}

function showResult(id, text) {
  byId(id).textContent = text;
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2
  }).format(Number(value));
}

function getCookie(name) {
  var prefix = encodeURIComponent(name) + "=";
  var items = document.cookie.split(";");
  for (var i = 0; i < items.length; i += 1) {
    var item = items[i].trim();
    if (item.indexOf(prefix) === 0) {
      return item.slice(prefix.length);
    }
  }
  return "";
}

/*
 * 规范 8.10 要求前端同时带 X-Csrf-Token 和 Cookie 两个请求头，但浏览器把 Cookie
 * 列在 forbidden header name 名单里：fetch 里手写的那条会被静默丢弃（不报错、也不
 * 发送），而真正的 TMSESSNAME 本身是 HttpOnly，JS 读出来永远是空串。会话实际靠
 * credentials:"include" 自动携带，所以这里只保留真正能生效的 X-Csrf-Token，
 * 并且 GET 不带 Content-Type——它是 CORS 非安全字段，会让请求先付一次预检。
 */
function platformHeaders(withJsonBody) {
  var headers = {};
  var csrf = getCookie("X-Csrf-Token");
  if (csrf) {
    headers["X-Csrf-Token"] = csrf;
  }
  if (withJsonBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

var FAILURE_SUMMARY = {
  network: "请求没能离开浏览器",
  session: "TOS 会话没有生效",
  gateway: "平台代理没有转到本应用",
  offline: "后端服务返回了错误",
  rejected: "后端服务拒绝了这次请求"
};

function apiFailure(kind, url, detail) {
  var error = new Error(FAILURE_SUMMARY[kind] + "：" + detail);
  error.kind = kind;
  error.url = url;
  error.detail = detail;
  // 只有"这次输入不行"不算服务故障：400 是用户填错了，不该弹故障横幅。
  error.serviceDown = kind !== "rejected";
  return error;
}

function isLoginEnvelope(data) {
  return !!data && (data.is_login === false || data.code_num === 117 || data.msg === "please login");
}

async function send(root, endpoint, payload) {
  var url = root + "/" + endpoint;
  var withBody = payload !== undefined && payload !== null;
  var response;
  try {
    response = await fetch(url, {
      method: withBody ? "POST" : "GET",
      credentials: "include",
      headers: platformHeaders(withBody),
      body: withBody ? JSON.stringify(payload) : undefined
    });
  } catch (error) {
    // TypeError: Failed to fetch 只说明请求在网络层失败（证书不受信、连接被重置、
    // CORS/CSP 拦截、页面处于沙箱来源），它并不能证明后端进程没在跑。
    throw apiFailure("network", url, (error.name || "Error") + ": " + error.message);
  }
  var text = await response.text().catch(function () {
    return "";
  });
  var data = null;
  try {
    data = JSON.parse(text);
  } catch (error) {
    data = null;
  }
  if (response.status === 401 || isLoginEnvelope(data)) {
    throw apiFailure("session", url, "平台回了未登录响应（HTTP " + response.status + "）");
  }
  if (data === null) {
    throw apiFailure("gateway", url, "HTTP " + response.status + " 且响应不是 JSON");
  }
  if (!response.ok) {
    throw apiFailure(response.status >= 500 ? "offline" : "rejected", url,
      data.error || ("HTTP " + response.status));
  }
  if (data.ok === false) {
    throw apiFailure("rejected", url, data.error || "后端返回 ok:false");
  }
  return data;
}

var apiRootReady = false;

async function refreshApiRoot() {
  var lastError = null;
  for (var i = 0; i < API_CANDIDATES.length; i += 1) {
    var root = API_CANDIDATES[i];
    var data;
    try {
      data = await send(root, "health", null);
    } catch (error) {
      // 会话问题换路径也没用，立刻上报，别把三次失败都算成"后端没起来"。
      if (error.kind === "session" || error.kind === "network") {
        throw error;
      }
      lastError = error;
      continue;
    }
    if (data.app !== APP_ID) {
      lastError = apiFailure("gateway", root + "/health", "回包的 app 字段是 " + data.app);
      continue;
    }
    API_ROOT = root;
    apiRootReady = true;
    return data;
  }
  if (lastError) {
    throw lastError;
  }
  throw apiFailure("gateway", API_CANDIDATES[0] + "/health", "所有候选代理路径都不可用");
}

async function apiRequest(endpoint, payload) {
  if (!apiRootReady) {
    await refreshApiRoot();
  }
  try {
    return await send(API_ROOT, endpoint, payload);
  } catch (error) {
    // 已选定的路径突然不通（固件变更、代理规则改过），重新探测一次再重试。
    if (error.kind === "gateway") {
      apiRootReady = false;
      await refreshApiRoot();
      return await send(API_ROOT, endpoint, payload);
    }
    throw error;
  }
}


function setBackendState(state, text) {
  var badge = byId("backendBadge");
  badge.className = "status-badge status-" + state;
  byId("backendBadgeText").textContent = text;
}

/*
 * 四种失败各有各的成因，不能统一写成"后端服务未运行"：浏览器在网络层丢掉请求
 * （Failed to fetch）、平台判定未登录、代理没命中本应用、后端真的报错，处置方式
 * 完全不同。横幅按 kind 切换标题、正文、颜色，并把真正失败的那个 URL 显示出来。
 */
var NOTICE_COPY = {
  network: {
    title: "无法连接平台代理",
    reason: "请求被浏览器拦在了网络层，没有走到生活工具箱的后端，所以现在还不能断定服务本身没在运行。"
  },
  session: {
    title: "TOS 会话没有生效",
    reason: "平台拒绝把请求转发给生活工具箱：当前页面没有拿到有效的 TOS 登录会话，后端服务本身可能是正常的。"
  },
  gateway: {
    title: "平台代理没有转到本应用",
    reason: "请求发出去了，但回到的是 nginx 或 TOS 平台的响应，不是生活工具箱的接口。"
  },
  offline: {
    title: "后端服务未运行",
    reason: "生活工具箱的本地服务返回了错误；所有计算都在后端完成，因此不会返回结果。"
  }
};

var NOTICE_STEPS = {
  unit: { pre: "SSH 执行 ", code: "systemctl status lifetoolbox-system.service", post: " 查看失败原因。" },
  diagnostics: {
    pre: "安装阶段的诊断记录在 ",
    code: "/usr/local/life-toolbox/logs/postinst-diagnostic.txt",
    post: "。"
  }
};

function noticeSteps(kind, error) {
  var steps = [{ pre: "实际失败的请求地址：", code: error.url }];
  if (kind === "session") {
    steps.push("先在同一个浏览器里登录 TOS 桌面，再从应用中心打开生活工具箱。");
    steps.push({
      pre: "未登录时平台固定回 ",
      code: "{\"is_login\":false,\"code_num\":117}",
      post: "，那不是本应用的响应。"
    });
    steps.push("通过 TDM 远程或反向代理访问时换成局域网地址试试；证书不受信时浏览器同样会丢掉请求。");
    return steps;
  }
  if (kind === "network") {
    steps.push("按 F12 打开网络面板看这条请求：显示 (blocked) 或 Blocked by client 时是浏览器扩展拦的，" +
      "把这台设备加进例外再刷新。");
    steps.push("确认浏览器已经信任这台设备的证书（地址栏不再提示不安全），或改用局域网地址直接访问。");
    steps.push("确认页面是从 TOS 应用中心打开的，而不是本地另存的 HTML 副本——脱离设备域名时同源请求必然失败。");
    steps.push(NOTICE_STEPS.unit);
    return steps;
  }
  if (kind === "gateway") {
    steps.push("确认应用已经在应用中心完成注册，平台才知道该把请求转给哪个套接字。");
    steps.push(NOTICE_STEPS.unit);
    steps.push(NOTICE_STEPS.diagnostics);
    return steps;
  }
  steps.push("在应用中心先停用，再重新启用生活工具箱。");
  steps.push(NOTICE_STEPS.unit);
  steps.push(NOTICE_STEPS.diagnostics);
  return steps;
}

function renderNoticeSteps(steps) {
  var list = byId("serviceNoticeSteps");
  if (!list) {
    return;
  }
  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }
  steps.forEach(function (step) {
    var item = document.createElement("li");
    if (typeof step === "string") {
      item.textContent = step;
    } else {
      item.textContent = step.pre || "";
      var code = document.createElement("code");
      code.textContent = step.code;
      item.appendChild(code);
      if (step.post) {
        item.appendChild(document.createTextNode(step.post));
      }
    }
    list.appendChild(item);
  });
}

function noticeKindOf(error) {
  if (error && NOTICE_COPY[error.kind]) {
    return error.kind;
  }
  return "offline";
}

function setServiceNotice(visible, error) {
  var notice = byId("serviceNotice");
  var title = byId("serviceNoticeTitle");
  var text = byId("serviceNoticeReason");
  if (!notice || !title || !text) {
    return;
  }
  if (!visible) {
    notice.hidden = true;
    return;
  }
  var kind = noticeKindOf(error);
  var copy = NOTICE_COPY[kind];
  notice.setAttribute("data-kind", kind);
  title.textContent = copy.title;
  text.textContent = copy.reason + " 详情：" + (error.detail || error.message);
  renderNoticeSteps(noticeSteps(kind, error));
  notice.hidden = false;
}

async function checkBackend() {
  setBackendState("checking", "检查服务");
  try {
    var data = await refreshApiRoot();
    setBackendState("online", "Python " + data.python);
    setServiceNotice(false);
  } catch (error) {
    var kind = noticeKindOf(error);
    if (kind === "session") {
      setBackendState("warn", "会话未生效");
    } else if (kind === "offline") {
      setBackendState("offline", "后端不可用");
    } else {
      setBackendState("warn", "代理不通");
    }
    setServiceNotice(true, error);
  }
}


function activateTab(button) {
  var tabs = document.querySelectorAll(".tab");
  var panels = document.querySelectorAll(".tool-panel");
  tabs.forEach(function (tab) {
    tab.classList.toggle("is-active", tab === button);
  });
  panels.forEach(function (panel) {
    panel.classList.toggle("is-active", panel.id === button.dataset.tab);
  });
}

var operations = {
  date: async function () {
    var data = await apiRequest("calculate", {
      operation: "date",
      start: byId("dateStart").value,
      end: byId("dateEnd").value
    });
    showResult(
      "dateResult",
      "相差 " + data.result.absolute_days + " 天\n方向：" +
        (data.result.direction === "forward" ? "向后" : "向前")
    );
  },

  unit: async function () {
    var data = await apiRequest("calculate", {
      operation: "unit",
      value: numberValue("unitValue"),
      from_unit: byId("unitFrom").value,
      to_unit: byId("unitTo").value
    });
    showResult(
      "unitResult",
      formatNumber(byId("unitValue").value) + " " + data.result.from + " = " +
        formatNumber(data.result.value) + " " + data.result.to
    );
  },

  bmi: async function () {
    var labels = {
      underweight: "偏轻",
      normal: "正常范围",
      overweight: "偏重",
      obesity: "肥胖范围"
    };
    var data = await apiRequest("calculate", {
      operation: "bmi",
      height_cm: numberValue("heightCm"),
      weight_kg: numberValue("weightKg")
    });
    showResult("bmiResult", "BMI：" + formatNumber(data.result.bmi) + "\n分类：" + labels[data.result.category]);
  },

  discount: async function () {
    var data = await apiRequest("calculate", {
      operation: "discount",
      original_price: numberValue("originalPrice"),
      discount_percent: numberValue("discountPercent"),
      tax_percent: numberValue("taxPercent")
    });
    showResult(
      "discountResult",
      "折后价：" + formatNumber(data.result.discounted_price) +
        "\n优惠：" + formatNumber(data.result.saved) +
        "\n税额：" + formatNumber(data.result.tax) +
        "\n最终价格：" + formatNumber(data.result.total)
    );
  },

  tip: async function () {
    var data = await apiRequest("calculate", {
      operation: "tip",
      bill: numberValue("tipBill"),
      tip_percent: numberValue("tipPercent"),
      people: numberValue("tipPeople")
    });
    showResult(
      "tipResult",
      "含小费总额：" + formatNumber(data.result.total) +
        "\n小费：" + formatNumber(data.result.tip) +
        "\n每人支付：" + formatNumber(data.result.per_person)
    );
  },

  fuel: async function () {
    var data = await apiRequest("calculate", {
      operation: "fuel",
      distance_km: numberValue("fuelDistance"),
      liters_per_100km: numberValue("fuelConsumption"),
      price_per_liter: numberValue("fuelPrice")
    });
    showResult(
      "fuelResult",
      "预计耗油：" + formatNumber(data.result.liters) + " L\n预计费用：" + formatNumber(data.result.cost)
    );
  },

  loan: async function () {
    var data = await apiRequest("calculate", {
      operation: "loan",
      principal: numberValue("loanPrincipal"),
      annual_rate_percent: numberValue("loanRate"),
      years: numberValue("loanYears")
    });
    showResult(
      "loanResult",
      "月供：" + formatNumber(data.result.monthly_payment) +
        "\n总还款：" + formatNumber(data.result.total_payment) +
        "\n总利息：" + formatNumber(data.result.total_interest)
    );
  },

  picker: async function () {
    var items = byId("pickerItems").value.split(/\r?\n/);
    var data = await apiRequest("pick", { items: items });
    showResult("pickerResult", "选中：" + data.picked);
  },

  password: async function () {
    var data = await apiRequest("password", {
      length: numberValue("passwordLength"),
      mode: byId("passwordMode").value
    });
    showResult("passwordResult", data.password);
  }
};

function bindEvents() {
  document.querySelectorAll(".tab").forEach(function (button) {
    button.addEventListener("click", function () {
      activateTab(button);
    });
  });

  document.querySelectorAll("[data-operation]").forEach(function (button) {
    button.addEventListener("click", async function () {
      var key = button.dataset.operation;
      var resultId = {
        date: "dateResult",
        unit: "unitResult",
        bmi: "bmiResult",
        discount: "discountResult",
        tip: "tipResult",
        fuel: "fuelResult",
        loan: "loanResult",
        picker: "pickerResult",
        password: "passwordResult"
      }[key];

      button.disabled = true;
      showResult(resultId, "计算中 ...");
      try {
        await operations[key]();
        setBackendState("online", "服务正常");
      } catch (error) {
        showResult(resultId, "错误：" + error.message);
        if (!error.serviceDown) {
          // 输入不合法（后端回 400）只是这次算不出来，服务仍然是好的。
          setBackendState("online", "服务正常");
          return;
        }
        setBackendState(noticeKindOf(error) === "offline" ? "offline" : "warn", "计算失败");
        setServiceNotice(true, error);
      } finally {
        button.disabled = false;
      }
    });
  });

  byId("checkBackend").addEventListener("click", checkBackend);
  byId("serviceNoticeRetry").addEventListener("click", function () {
    setServiceNotice(false);
    checkBackend();
  });
}

document.addEventListener("DOMContentLoaded", function () {
  bindEvents();
  checkBackend();
});
