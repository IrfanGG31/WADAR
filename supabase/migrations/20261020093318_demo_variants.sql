-- Ruang Demo (staging): three small demo shops for the biggest UMKM segments, next to the
-- two story shops (skincare, kopi). Each holds 30 days and a short catalog (8–10 products):
--   warkop   — Warkop Mas Bayu: cheap, high-volume drinks + mie, mostly cash, a little GoFood.
--   penyetan — Penyetan Bu Ratmi: lunch/dinner, GoFood grows this week with a 20% promo,
--              so Keuangan reads "omzet naik, untung tipis: diskon + komisi GoFood".
--   madura   — Warung Madura Cak Mat: open 24 hours, tiny margins, eceran units
--              (rokok per batang, bensin per liter); Gas LPG 3 kg is running low.
-- The profile is stored on the tenant (demo_profile); older demo shops keep deriving it.

alter table public.tenants add column if not exists demo_profile text;

create or replace function app.demo_profile(p_tenant public.tenants) returns text
language sql stable set search_path = '' as $$
  select coalesce(p_tenant.demo_profile, case when p_tenant.business_type = 'fnb' then 'kopi' else 'skincare' end)
$$;

create or replace function app.demo_profile_valid(p_profile text) returns text
language sql immutable set search_path = '' as $$
  select case when p_profile in ('skincare', 'kopi', 'warkop', 'penyetan', 'madura') then p_profile else 'skincare' end
$$;

create or replace function app.demo_slug_prefix(p_profile text) returns text
language sql immutable set search_path = '' as $$
  select case p_profile
    when 'kopi' then 'kopi-dimas-'
    when 'warkop' then 'warkop-mas-bayu-'
    when 'penyetan' then 'penyetan-bu-ratmi-'
    when 'madura' then 'warung-cak-mat-'
    else 'glow-by-sari-' end
$$;

-- Small generator for the segment demos: 30 days, no scripted story beyond a promo week.
create or replace function app.seed_demo_lite(p_tenant uuid, p_profile text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.tenants;
  tz text;
  local_now timestamp;
  today date;
  days int := 30;
  start_day date;
  catalog jsonb;
  ch_names text[];
  ch_ids uuid[];
  ch_kind text[];
  ch_fee_pct numeric[];
  ch_fee_fixed bigint[];
  ch_w_normal double precision[];
  ch_w_recent double precision[];
  disc_p_normal double precision;
  disc_p_recent double precision;
  disc_pct int;
  recent_boost double precision;
  cust_p double precision;
  open_min int;
  close_min int;
  nv int := 0;
  v_id uuid[] := '{}'; v_name text[] := '{}'; v_price bigint[] := '{}'; v_cost bigint[] := '{}';
  v_avg bigint[] := '{}'; v_onh int[] := '{}'; v_vel double precision[] := '{}'; v_lead int[] := '{}';
  v_pack int[] := '{}'; v_scen text[] := '{}'; v_pending_qty int[] := '{}'; v_pending_day int[] := '{}';
  s_n int := 0;
  s_id uuid[] := '{}'; s_ch uuid[] := '{}'; s_cust uuid[] := '{}'; s_sub bigint[] := '{}';
  s_disc bigint[] := '{}'; s_fee bigint[] := '{}'; s_total bigint[] := '{}'; s_pay text[] := '{}';
  s_at timestamptz[] := '{}'; s_est boolean[] := '{}'; s_src text[] := '{}';
  i_n int := 0;
  i_sale uuid[] := '{}'; i_var uuid[] := '{}'; i_name text[] := '{}'; i_qty int[] := '{}';
  i_price bigint[] := '{}'; i_cost bigint[] := '{}'; i_ad bigint[] := '{}'; i_af bigint[] := '{}'; i_cs boolean[] := '{}';
  m_n int := 0;
  m_var uuid[] := '{}'; m_qty int[] := '{}'; m_kind text[] := '{}'; m_cost bigint[] := '{}';
  m_ref uuid[] := '{}'; m_at timestamptz[] := '{}';
  c_n int := 0;
  c_id uuid[] := '{}'; c_phone text[] := '{}'; c_name text[] := '{}'; c_first text[] := '{}'; c_at timestamptz[] := '{}';
  first_names text[] := array['Ayu','Dewi','Rina','Putri','Sinta','Wulan','Agus','Joko','Slamet','Rizky','Fajar','Dimas',
                              'Yoga','Bayu','Hendra','Eko','Tono','Udin','Mega','Lina'];
  d int; k int; j int; u int; x int;
  day_date date; wd int; factor double precision; recent boolean;
  units int[]; demand int; order_size int; o_vars int[]; o_qtys int[];
  ch int; r double precision; acc double precision;
  sub bigint; disc bigint; fee bigint; gross bigint[]; a_disc bigint[]; a_fee bigint[];
  sale_id uuid; cust uuid; at_ts timestamptz; max_minute int; minute int; pay text;
  prod_id uuid; prod_var uuid; e jsonb; lbl text; total_units int; q int;
  v_policies jsonb; v_persona jsonb; v_faq jsonb; f jsonb; v_doc uuid;
begin
  select * into t from public.tenants where id = p_tenant;
  if not found then raise exception 'seed_demo_lite: tenant % not found', p_tenant; end if;
  tz := t.timezone;
  local_now := now() at time zone tz;
  today := local_now::date;
  start_day := today - (days - 1);
  perform setseed(case p_profile when 'warkop' then 0.311 when 'penyetan' then 0.423 else 0.517 end);

  if p_profile = 'warkop' then
    ch_names := array['pos', 'gofood', 'whatsapp'];
    ch_w_normal := array[0.82, 0.10, 0.08];
    ch_w_recent := array[0.78, 0.14, 0.08];
    disc_p_normal := 0.02; disc_p_recent := 0.04; disc_pct := 10;
    recent_boost := 1.08; cust_p := 0.25; open_min := 6 * 60; close_min := 24 * 60 - 1;
    catalog := '[
      {"n":"Kopi Hitam Tubruk","c":"Kopi","e":"☕","u":"gelas","p":5000,"h":1500,"v":26,"l":1,"k":50},
      {"n":"Kopi Susu Sachet","c":"Kopi","e":"🥛","u":"gelas","p":6000,"h":2500,"v":18,"l":1,"k":50},
      {"n":"Es Teh Manis","c":"Minuman","e":"🧊","u":"gelas","p":4000,"h":1000,"v":22,"l":1,"k":50},
      {"n":"Wedang Jahe","c":"Minuman","e":"🫚","u":"gelas","p":6000,"h":2000,"v":6,"l":2,"k":30},
      {"n":"Indomie Telur","c":"Makanan","e":"🍜","u":"porsi","p":12000,"h":6000,"v":6,"l":2,"k":40,"o":["Rebus","Goreng"]},
      {"n":"Roti Bakar","c":"Makanan","e":"🍞","u":"porsi","p":10000,"h":4500,"v":3,"l":2,"k":20,"o":["Coklat","Keju"]},
      {"n":"Pisang Goreng","c":"Gorengan","e":"🍌","u":"biji","p":2000,"h":800,"v":16,"l":1,"k":50},
      {"n":"Tahu Isi","c":"Gorengan","e":"🥟","u":"biji","p":1500,"h":600,"v":14,"l":1,"k":50}
    ]'::jsonb;
    v_policies := '{"hours":"Setiap hari 06.00–24.00 WIB","address":"Jl. Raya Kertajaya No. 7, Surabaya","shipping_areas":"Pesan antar lewat GoFood, radius 3 km.","shipping_estimates":[],"cod":{"available":false,"note":""},"payment_methods":["Tunai","QRIS"],"returns":"","warranty":"","processing_time":"Minuman 3–5 menit, mie 10 menit.","order_steps":"Tulis menu dan jumlahnya di chat ini, ambil di warung atau pesan lewat GoFood.","admin_contact":"0813-3100-2468","promo":"Kopi + pisang goreng Rp6.000 sebelum jam 09.00."}'::jsonb;
    v_persona := '{"name":"Bayu","salutation":"Mas","style":"santai","emoji":true,"holding_message":""}'::jsonb;
    v_faq := '[
      {"question":"Buka jam berapa?","answer":"Tiap hari jam 6 pagi sampai 12 malam, Mas."},
      {"question":"Bisa nonton bola bareng?","answer":"Bisa, ada TV dan wifi gratis. Kalau ramai, datang lebih awal ya."},
      {"question":"Bisa bayar QRIS?","answer":"Bisa, QRIS semua e-wallet dan m-banking."}
    ]'::jsonb;
  elsif p_profile = 'penyetan' then
    ch_names := array['pos', 'gofood', 'whatsapp'];
    ch_w_normal := array[0.62, 0.28, 0.10];
    ch_w_recent := array[0.48, 0.44, 0.08];
    disc_p_normal := 0.05; disc_p_recent := 0.35; disc_pct := 20;
    recent_boost := 1.12; cust_p := 0.4; open_min := 10 * 60; close_min := 22 * 60;
    catalog := '[
      {"n":"Ayam Penyet","c":"Penyetan","e":"🍗","u":"porsi","p":18000,"h":9500,"v":11,"l":1,"k":20,"o":["Paha","Dada"],"d":"Ayam goreng digeprek dengan sambal bawang, lalapan, dan tahu."},
      {"n":"Lele Penyet","c":"Penyetan","e":"🐟","u":"porsi","p":15000,"h":7000,"v":9,"l":1,"k":20,"d":"Lele goreng garing, sambal terasi, lalapan."},
      {"n":"Bebek Penyet","c":"Penyetan","e":"🦆","u":"porsi","p":28000,"h":16000,"v":4,"l":2,"k":10},
      {"n":"Tempe Tahu Penyet","c":"Penyetan","e":"🧈","u":"porsi","p":10000,"h":3500,"v":6,"l":1,"k":20},
      {"n":"Nasi Putih","c":"Tambahan","e":"🍚","u":"porsi","p":4000,"h":1500,"v":26,"l":1,"k":50},
      {"n":"Sambal Extra","c":"Tambahan","e":"🌶️","u":"porsi","p":3000,"h":700,"v":9,"l":1,"k":30,"o":["Bawang","Terasi","Ijo"]},
      {"n":"Es Teh Manis","c":"Minuman","e":"🧊","u":"gelas","p":4000,"h":1000,"v":20,"l":1,"k":50},
      {"n":"Es Jeruk","c":"Minuman","e":"🍊","u":"gelas","p":6000,"h":2200,"v":7,"l":1,"k":30}
    ]'::jsonb;
    v_policies := '{"hours":"Setiap hari 10.00–22.00 WIB","address":"Jl. Ngagel Jaya No. 45, Surabaya","shipping_areas":"Pesan antar lewat GoFood, atau ambil sendiri.","shipping_estimates":[],"cod":{"available":false,"note":""},"payment_methods":["Tunai","QRIS","Transfer BRI"],"returns":"Pesanan yang salah kami ganti di hari yang sama.","warranty":"","processing_time":"Pesanan siap 10–15 menit.","order_steps":"Tulis menu, level sambal, dan jam ambil di chat ini.","admin_contact":"0812-3300-1357","promo":"Promo GoFood minggu ini: diskon 20%."}'::jsonb;
    v_persona := '{"name":"Bu Ratmi","salutation":"Kak","style":"santai","emoji":true,"holding_message":"Sebentar ya Kak, Bu Ratmi cek dulu di dapur 🙏"}'::jsonb;
    v_faq := '[
      {"question":"Sambalnya pedes banget?","answer":"Bisa pilih level: biasa, sedang, atau pedas mampus. Tulis saja di catatan pesanan."},
      {"question":"Bisa pesan untuk nasi kotak?","answer":"Bisa Kak, minimal 20 kotak, kabari H-1 lewat chat ini."},
      {"question":"Ayamnya ayam kampung?","answer":"Ayam potong segar tiap pagi; bebeknya bebek kampung."}
    ]'::jsonb;
  else
    ch_names := array['pos', 'whatsapp'];
    ch_w_normal := array[0.95, 0.05];
    ch_w_recent := array[0.94, 0.06];
    disc_p_normal := 0; disc_p_recent := 0; disc_pct := 0;
    recent_boost := 1.04; cust_p := 0.15; open_min := 0; close_min := 24 * 60 - 1;
    catalog := '[
      {"n":"Rokok Eceran","c":"Rokok","e":"🚬","u":"batang","p":2500,"h":1950,"v":34,"l":2,"k":16,"o":["Surya","Sampoerna Mild"]},
      {"n":"Rokok Sampoerna Mild 16","c":"Rokok","e":"📦","u":"bungkus","p":33000,"h":30500,"v":7,"l":2,"k":10},
      {"n":"Bensin Eceran","c":"BBM","e":"⛽","u":"liter","p":13000,"h":11000,"v":9,"l":2,"k":30,"d":"Pertalite eceran botol 1 liter."},
      {"n":"Gas LPG 3kg","c":"Gas","e":"🔥","u":"tabung","p":23000,"h":19500,"v":4,"l":3,"k":10,"s":"low"},
      {"n":"Indomie Goreng","c":"Sembako","e":"🍜","u":"pcs","p":3500,"h":2850,"v":22,"l":3,"k":40},
      {"n":"Telur Ayam","c":"Sembako","e":"🥚","u":"butir","p":2500,"h":2000,"v":18,"l":2,"k":30},
      {"n":"Beras 5kg","c":"Sembako","e":"🌾","u":"karung","p":78000,"h":71000,"v":1.2,"l":4,"k":5},
      {"n":"Minyak Goreng 1L","c":"Sembako","e":"🫗","u":"pcs","p":19000,"h":17000,"v":3,"l":4,"k":12},
      {"n":"Air Mineral 600ml","c":"Minuman","e":"💧","u":"botol","p":4000,"h":2700,"v":15,"l":3,"k":24},
      {"n":"Kopi Sachet","c":"Minuman","e":"☕","u":"sachet","p":2000,"h":1400,"v":16,"l":3,"k":40}
    ]'::jsonb;
    v_policies := '{"hours":"Buka 24 jam, setiap hari","address":"Jl. Kalibokor No. 3, Surabaya","shipping_areas":"Antar ke rumah untuk gas & galon, radius 1 km.","shipping_estimates":[{"area":"Radius 1 km","cost_min":0,"cost_max":3000,"eta":"15 menit","keywords":["kalibokor","pucang","ngagel"]}],"cod":{"available":true,"note":"bayar ke yang antar"},"payment_methods":["Tunai","QRIS"],"returns":"","warranty":"","processing_time":"Langsung.","order_steps":"Tulis barang, jumlah, dan alamat di chat ini.","admin_contact":"0819-3200-8642","promo":""}'::jsonb;
    v_persona := '{"name":"Cak Mat","salutation":"Mas","style":"santai","emoji":false,"holding_message":""}'::jsonb;
    v_faq := '[
      {"question":"Buka 24 jam beneran?","answer":"Beneran, Mas. Gantian jaga sama keponakan, gak pernah tutup kecuali Idul Adha."},
      {"question":"Bisa antar gas?","answer":"Bisa, radius 1 km gratis ongkos. Tulis alamatnya di sini."},
      {"question":"Ada bensin?","answer":"Ada Pertalite eceran botol 1 liter."}
    ]'::jsonb;
  end if;

  select array_agg(c.id order by array_position(ch_names, c.kind::text)),
         array_agg(c.kind::text order by array_position(ch_names, c.kind::text)),
         array_agg(c.fee_pct order by array_position(ch_names, c.kind::text)),
         array_agg(c.fee_fixed order by array_position(ch_names, c.kind::text))
    into ch_ids, ch_kind, ch_fee_pct, ch_fee_fixed
    from public.channels c where c.tenant_id = p_tenant and c.kind::text = any (ch_names);

  -- Catalog + opening stock (~14 days of demand) the day before the window.
  for e in select value from jsonb_array_elements(catalog) loop
    insert into public.products (tenant_id, name, category, description, image_path, unit)
    values (p_tenant, e->>'n', e->>'c', e->>'d', e->>'e', coalesce(e->>'u', 'pcs'))
    returning id into prod_id;
    for lbl in select coalesce(value #>> '{}', '') from jsonb_array_elements(coalesce(e->'o', '[null]'::jsonb)) loop
      nv := nv + 1;
      insert into public.variants (tenant_id, product_id, sku, option_label, price, avg_cost, cost_is_set,
                                   min_stock, lead_time_days, pack_size)
      values (p_tenant, prod_id,
              upper(left(regexp_replace(e->>'n', '[^A-Za-z]', '', 'g'), 4)) || '-' || lpad(nv::text, 3, '0'),
              nullif(lbl, ''), (e->>'p')::bigint, (e->>'h')::bigint, true,
              greatest(3, ceil((e->>'v')::numeric / coalesce(jsonb_array_length(e->'o'), 1) * 2)::int),
              (e->>'l')::int, (e->>'k')::int)
      returning id into prod_var;
      v_id[nv] := prod_var;
      v_name[nv] := (e->>'n') || coalesce(' — ' || nullif(lbl, ''), '');
      v_price[nv] := (e->>'p')::bigint;
      v_cost[nv] := (e->>'h')::bigint;
      v_avg[nv] := v_cost[nv];
      -- Velocity is per product; options share it.
      v_vel[nv] := (e->>'v')::double precision / coalesce(jsonb_array_length(e->'o'), 1);
      v_lead[nv] := (e->>'l')::int;
      v_pack[nv] := (e->>'k')::int;
      v_scen[nv] := coalesce(e->>'s', 'normal');
      v_pending_qty[nv] := 0;
      v_pending_day[nv] := -1;
      v_onh[nv] := (ceil(v_vel[nv] * 14 / v_pack[nv]) * v_pack[nv])::int;
      m_n := m_n + 1;
      m_var[m_n] := v_id[nv]; m_qty[m_n] := v_onh[nv]; m_kind[m_n] := 'purchase'; m_cost[m_n] := v_cost[nv];
      m_ref[m_n] := null; m_at[m_n] := ((start_day - 1) + time '05:00') at time zone tz;
    end loop;
  end loop;

  for d in 0..days - 1 loop
    day_date := start_day + d;
    wd := extract(isodow from day_date)::int;
    factor := case wd when 5 then 1.10 when 6 then 1.25 when 7 then 1.20 when 1 then 0.90 else 1.0 end;
    recent := d >= days - 8;
    if recent then factor := factor * recent_boost; end if;
    if day_date = today then
      max_minute := greatest(1, (extract(hour from local_now) * 60 + extract(minute from local_now))::int - 1);
      if max_minute <= open_min then
        factor := 0;
      else
        factor := factor * least(1.0, (max_minute - open_min)::double precision / greatest(1, close_min - open_min));
      end if;
    else
      max_minute := close_min;
    end if;

    -- Restock arrivals early in the morning.
    for k in 1..nv loop
      if v_pending_day[k] = d and v_pending_qty[k] > 0 then
        v_avg[k] := app.weighted_avg_cost(v_onh[k], v_avg[k], v_pending_qty[k], v_cost[k]);
        v_onh[k] := v_onh[k] + v_pending_qty[k];
        m_n := m_n + 1;
        m_var[m_n] := v_id[k]; m_qty[m_n] := v_pending_qty[k]; m_kind[m_n] := 'purchase'; m_cost[m_n] := v_cost[k];
        m_ref[m_n] := null; m_at[m_n] := (day_date + time '05:00') at time zone tz;
        v_pending_qty[k] := 0; v_pending_day[k] := -1;
      end if;
    end loop;

    units := '{}';
    for k in 1..nv loop
      if d >= days - 15 then
        demand := floor(v_vel[k] * factor + random())::int;
      else
        demand := app.rand_poisson(v_vel[k] * factor);
      end if;
      demand := least(demand, greatest(0, v_onh[k]));
      for u in 1..demand loop units := units || k; end loop;
    end loop;

    total_units := coalesce(array_length(units, 1), 0);
    for u in reverse total_units..2 loop
      j := 1 + floor(random() * u)::int;
      x := units[u]; units[u] := units[j]; units[j] := x;
    end loop;

    u := 1;
    while u <= total_units loop
      r := random();
      order_size := case when r < 0.45 then 1 when r < 0.80 then 2 else 3 end;
      o_vars := '{}'; o_qtys := '{}';
      for j in 1..order_size loop
        exit when u > total_units;
        k := array_position(o_vars, units[u]);
        if k is null then
          o_vars := o_vars || units[u]; o_qtys := o_qtys || 1;
        else
          o_qtys[k] := o_qtys[k] + 1;
        end if;
        u := u + 1;
      end loop;

      r := random(); acc := 0; ch := array_length(ch_ids, 1);
      for j in 1..array_length(ch_ids, 1) loop
        acc := acc + case when recent then ch_w_recent[j] else ch_w_normal[j] end;
        if r < acc then ch := j; exit; end if;
      end loop;

      gross := '{}'; sub := 0;
      for j in 1..array_length(o_vars, 1) loop
        gross := gross || (o_qtys[j] * v_price[o_vars[j]]);
        sub := sub + gross[j];
      end loop;
      disc := 0;
      -- The promo runs on GoFood (penyetan); elsewhere it is a rare loyal-customer discount.
      if disc_pct > 0 and (ch_kind[ch] = 'gofood' or p_profile <> 'penyetan')
         and random() < (case when recent then disc_p_recent else disc_p_normal end) then
        disc := (round(sub * disc_pct / 100.0 / 100) * 100)::bigint;
      end if;
      fee := app.estimate_platform_fee(sub - disc, ch_fee_pct[ch], ch_fee_fixed[ch]);
      a_disc := app.alloc_lr(disc, gross);
      a_fee := app.alloc_lr(fee, gross);

      minute := open_min + floor(random() * greatest(1, max_minute - open_min))::int;
      at_ts := (day_date + make_interval(mins => minute)) at time zone tz;

      cust := null;
      if ch_kind[ch] in ('pos', 'whatsapp') and random() < cust_p then
        if c_n > 0 and random() < 0.65 then
          cust := c_id[1 + floor(random() * c_n)::int];
        else
          c_n := c_n + 1;
          c_id[c_n] := app.uuid_v7();
          c_phone[c_n] := '+628' || (1 + floor(random() * 9))::int || lpad((floor(random() * 100000000))::bigint::text, 8, '0');
          c_name[c_n] := first_names[1 + floor(random() * array_length(first_names, 1))::int];
          c_first[c_n] := ch_kind[ch];
          c_at[c_n] := at_ts;
          cust := c_id[c_n];
        end if;
      end if;

      pay := case
        when ch_kind[ch] = 'gofood' then 'marketplace'
        when ch_kind[ch] = 'whatsapp' then case when random() < 0.5 then 'transfer' else 'qris' end
        else case when random() < 0.7 then 'tunai' else 'qris' end end;

      sale_id := app.uuid_v7();
      s_n := s_n + 1;
      s_id[s_n] := sale_id; s_ch[s_n] := ch_ids[ch]; s_cust[s_n] := cust; s_sub[s_n] := sub;
      s_disc[s_n] := disc; s_fee[s_n] := fee; s_total[s_n] := sub - disc; s_pay[s_n] := pay;
      s_at[s_n] := at_ts; s_est[s_n] := fee > 0; s_src[s_n] := case when ch_kind[ch] = 'pos' then 'pos' else 'manual' end;

      for j in 1..array_length(o_vars, 1) loop
        k := o_vars[j];
        i_n := i_n + 1;
        i_sale[i_n] := sale_id; i_var[i_n] := v_id[k]; i_name[i_n] := v_name[k]; i_qty[i_n] := o_qtys[j];
        i_price[i_n] := v_price[k]; i_cost[i_n] := v_avg[k]; i_ad[i_n] := a_disc[j]; i_af[i_n] := a_fee[j];
        i_cs[i_n] := true;
        m_n := m_n + 1;
        m_var[m_n] := v_id[k]; m_qty[m_n] := -o_qtys[j]; m_kind[m_n] := 'sale'; m_cost[m_n] := v_avg[k];
        m_ref[m_n] := sale_id; m_at[m_n] := at_ts;
        v_onh[k] := v_onh[k] - o_qtys[j];
      end loop;
    end loop;

    -- Reorder at close when cover < lead + 3 days. 'low' items stop reordering 9 days
    -- before today, so Beranda / Prediksi has one honest "hampir habis" to show.
    for k in 1..nv loop
      continue when v_pending_qty[k] > 0;
      continue when v_scen[k] = 'low' and d >= days - 9;
      if v_onh[k] <= v_vel[k] * (v_lead[k] + 3) then
        q := (ceil(v_vel[k] * (v_lead[k] + 10) / v_pack[k]) * v_pack[k])::int;
        v_pending_qty[k] := q;
        v_pending_day[k] := d + v_lead[k];
      end if;
    end loop;
  end loop;

  insert into public.customers (id, tenant_id, phone_e164, name, first_channel, created_at)
  select cid, p_tenant, phone, nm, first::public.channel_kind, at
    from unnest(c_id, c_phone, c_name, c_first, c_at) as c(cid, phone, nm, first, at)
  on conflict (tenant_id, phone_e164) do nothing;

  insert into public.sales (id, tenant_id, channel_id, source, customer_id, subtotal, order_discount, platform_fee,
                            platform_fee_estimated, total, payment_method, occurred_at, idempotency_key, created_at)
  select sid, p_tenant, chid, src::public.sale_source,
         (select id from public.customers where id = cid), sub_, disc_, fee_, est, total_, pay_, at_, 'seed-' || sid, at_
    from unnest(s_id, s_ch, s_cust, s_sub, s_disc, s_fee, s_total, s_pay, s_at, s_est, s_src)
      as s(sid, chid, cid, sub_, disc_, fee_, total_, pay_, at_, est, src);

  insert into public.sale_items (tenant_id, sale_id, variant_id, name_snapshot, qty, unit_price, line_discount,
                                 unit_cost_snapshot, cost_is_set_snapshot, alloc_order_discount, alloc_platform_fee)
  select p_tenant, sid, vid, nm, q_, pr, 0, co, cs, ad, af
    from unnest(i_sale, i_var, i_name, i_qty, i_price, i_cost, i_cs, i_ad, i_af)
      as it(sid, vid, nm, q_, pr, co, cs, ad, af);

  insert into public.stock_movements (tenant_id, variant_id, qty, kind, unit_cost, ref_type, ref_id, occurred_at, created_at)
  select p_tenant, vid, q_, k_::public.movement_kind, co, case when k_ = 'sale' then 'sale' else 'seed' end, ref, at_, at_
    from unnest(m_var, m_qty, m_kind, m_cost, m_ref, m_at) as m(vid, q_, k_, co, ref, at_);

  for k in 1..nv loop
    update public.variants set on_hand = v_onh[k], avg_cost = v_avg[k] where id = v_id[k];
  end loop;

  update public.customers c
     set total_spent = agg.spent, orders_count = agg.cnt, last_order_at = agg.last_at
    from (select customer_id, sum(total) as spent, count(*) as cnt, max(occurred_at) as last_at
            from public.sales where tenant_id = p_tenant and customer_id is not null group by customer_id) agg
   where c.id = agg.customer_id;

  -- Weekly expenses only, so the 7-day comparison never hinges on the date.
  insert into public.expenses (tenant_id, category, amount, occurred_at, note)
  select p_tenant, m.category, m.amount, dd::date, m.note
    from generate_series(start_day, today, interval '1 day') dd
    cross join (
      select * from (values
        ('warkop', 1, 'Bahan/Stok non-katalog', 650000::bigint, 'Kopi bubuk, gula, susu kental, gas'),
        ('warkop', 3, 'Listrik & Air', 90000::bigint, 'Token listrik, wifi'),
        ('warkop', 6, 'Gaji', 600000::bigint, 'Upah penjaga shift malam'),
        ('penyetan', 1, 'Bahan/Stok non-katalog', 900000::bigint, 'Cabai, bawang, minyak, lalapan'),
        ('penyetan', 4, 'Bahan/Stok non-katalog', 700000::bigint, 'Cabai, minyak, gas'),
        ('penyetan', 3, 'Listrik & Air', 120000::bigint, 'Listrik, air, gas'),
        ('penyetan', 6, 'Gaji', 1400000::bigint, 'Upah 2 karyawan mingguan'),
        ('madura', 3, 'Listrik & Air', 110000::bigint, 'Token listrik 24 jam'),
        ('madura', 6, 'Sewa', 300000::bigint, 'Sewa kios mingguan'),
        ('madura', 7, 'Gaji', 500000::bigint, 'Uang jaga keponakan')
      ) v(profile, isodow, category, amount, note) where v.profile = p_profile
    ) m
   where extract(isodow from dd) = m.isodow;

  update public.store_profile set policies = v_policies, persona = v_persona where tenant_id = p_tenant;
  if not exists (select 1 from public.kb_documents where tenant_id = p_tenant and kind = 'faq') then
    for f in select value from jsonb_array_elements(v_faq) loop
      insert into public.kb_documents (tenant_id, kind, title, status)
      values (p_tenant, 'faq', f->>'question', 'ready')
      returning id into v_doc;
      insert into public.kb_chunks (tenant_id, document_id, content, metadata)
      values (p_tenant, v_doc, 'Tanya: ' || (f->>'question') || E'\nJawab: ' || (f->>'answer'),
              jsonb_build_object('kind', 'faq', 'question', f->>'question', 'answer', f->>'answer'));
    end loop;
  end if;

  perform setseed((extract(microseconds from clock_timestamp())::int % 1000000) / 500000.0 - 1);
end $$;
revoke execute on function app.seed_demo_lite(uuid, text) from public;

create or replace function app.new_demo_shop(p_owner uuid, p_profile text, p_slug text) returns public.tenants
language plpgsql security definer set search_path = '' as $$
declare
  v_profile text := app.demo_profile_valid(p_profile);
  v_tenant public.tenants;
begin
  v_tenant := app.create_tenant(
    p_owner,
    case v_profile
      when 'kopi' then 'Kopi Dimas'
      when 'warkop' then 'Warkop Mas Bayu'
      when 'penyetan' then 'Penyetan Bu Ratmi'
      when 'madura' then 'Warung Madura Cak Mat'
      else 'Glow by Sari' end,
    p_slug,
    case v_profile when 'skincare' then 'kecantikan' when 'madura' then 'kelontong' else 'fnb' end,
    true);
  update public.tenants set demo_profile = v_profile where id = v_tenant.id returning * into v_tenant;
  if v_profile in ('kopi', 'skincare') then
    perform app.seed_demo(v_tenant.id, v_profile);
  else
    perform app.seed_demo_lite(v_tenant.id, v_profile);
  end if;
  return v_tenant;
end $$;
revoke execute on function app.new_demo_shop(uuid, text, text) from public;

create or replace function public.create_demo_shop(p_profile text default 'skincare')
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_profile text := app.demo_profile_valid(p_profile);
  v_suffix text := substr(md5(random()::text || clock_timestamp()::text), 1, 5);
  v_existing public.tenants;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('create_demo_shop:' || auth.uid()::text, 0));

  select t.* into v_existing from public.tenants t
    join public.memberships m on m.tenant_id = t.id and m.user_id = auth.uid() and m.role = 'owner'
   where t.is_demo and t.slug not like '%-arsip-%' and app.demo_profile(t) = v_profile
   order by t.created_at desc
   limit 1;
  if found then
    return v_existing.slug;
  end if;

  return (app.new_demo_shop(auth.uid(), v_profile, app.demo_slug_prefix(v_profile) || v_suffix)).slug;
end $$;
revoke execute on function public.create_demo_shop(text) from public, anon;
grant execute on function public.create_demo_shop(text) to authenticated;

-- Ruang Demo: which demo shops (per profile) the signed-in user already has.
create or replace function public.my_demo_shops()
returns table (profile text, slug text, name text)
language sql stable security definer set search_path = '' as $$
  select distinct on (app.demo_profile(t)) app.demo_profile(t), t.slug, t.name
    from public.tenants t
    join public.memberships m on m.tenant_id = t.id and m.user_id = auth.uid() and m.role = 'owner'
   where t.is_demo and t.slug not like '%-arsip-%'
   order by app.demo_profile(t), t.created_at desc
$$;
revoke execute on function public.my_demo_shops() from public, anon;
grant execute on function public.my_demo_shops() to authenticated;
