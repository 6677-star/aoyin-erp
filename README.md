# 轻量 ERP 进销存系统

基于 React + Vite + Supabase + TailwindCSS 的轻量进销存系统，不包含财务模块。

## 已实现模块

- 登录：内部账号 + 密码，登录状态保存到 `localStorage.currentUser`
- 用户管理：新增、编辑、删除、修改密码、启用/禁用、分配角色
- 商品管理：新增、编辑、删除、搜索、SKU、库存预警
- 客户管理：新增、编辑、删除、搜索
- 供应商管理：新增、编辑、删除、搜索
- 公司资料：新增、编辑、删除、Logo 上传、设置启用资料
- 采购管理：采购入库、采购退货
- 销售管理：销售出库、销售退货，库存不足禁止出库
- 送货单管理：新建、编辑、删除、查看、打印、导出 PDF
- 库存管理：库存调整、库存流水查询、按商品/类型/日期筛选
- 仪表盘：商品总数、库存总量、低库存数量、今日采购入库、今日销售出库、最近流水、预警列表

## 目录结构

```text
.
├── index.html
├── package.json
├── supabase
│   └── schema.sql
└── src
    ├── App.jsx
    ├── main.jsx
    ├── styles.css
    ├── types.js
    └── lib
        └── supabase.js
```

## Supabase 配置

1. 在 Supabase SQL Editor 执行 `supabase/schema.sql` 全部内容。

2. SQL 会创建或更新：

- `products`
- `stock_logs`
- `customers`
- `suppliers`
- `delivery_orders`
- `delivery_order_items`
- `company_profile`
- `app_users`
- `move_stock`
- `next_delivery_order_no`
- `company-assets` Storage bucket 和开发期 RLS 策略
- 默认管理员账号：`admin` / `admin123`

开发阶段内部账号密码明文保存在 `app_users.password`，后续可升级为哈希密码。

角色：

- `admin` 管理员：全部功能、用户管理、删除数据
- `warehouse` 仓管员：商品查看、采购入库/退货、销售出库/退货、库存流水
- `sales` 销售员：商品查看、客户管理、送货单创建/打印、销售出库查看
- `viewer` 查看员：只读查看商品、库存、客户、供应商、送货单、库存流水

3. Logo 存储 bucket：

```text
company-assets
```

用于保存公司 Logo，前端上传成功后会把 public URL 保存到 `company_profile.logo_url`。

## 运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
npm run dev
```

`.env.local`：

```env
VITE_SUPABASE_URL=https://vqveqgxjngcrgojclpxg.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 构建

```bash
npm run build
```

## 送货单打印

送货单打印会读取 `company_profile` 中最新的 `is_active = true` 记录：

- `company_name` 显示在顶部公司名称
- `company_address` 显示在公司名称下方
- `logo_url` 显示在左上角 Logo
- `contact_phone` 和 `email` 显示在地址旁

如果没有启用公司资料，打印模板会显示默认占位：

- 公司名称：未设置公司名称
- 公司地址：未设置公司地址
- Logo：不显示
