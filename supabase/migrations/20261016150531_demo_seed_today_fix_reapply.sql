-- Re-apply of 20261016140903_demo_seed_today_fix after 20261015070000_demo_seed_story_cap,
-- which rewrote app.seed_demo and dropped the "today < now" + "ends-at-7 on any date" fixes.
-- This replays the same body as 20261016140903 so those fixes are the final definition.
create or replace function app.seed_demo(p_tenant uuid, p_profile text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.tenants;
  tz text;
  local_now timestamp;
  today date;
  start_day date;
  days int := 90;
  catalog jsonb;
  -- channel ids and weights (normal period / last 7 days)
  ch_ids uuid[];
  ch_kind text[];
  ch_fee_pct numeric[];
  ch_fee_fixed bigint[];
  ch_w_normal double precision[];
  ch_w_recent double precision[];
  disc_p_normal double precision;
  disc_pct_normal int;
  disc_p_recent double precision;
  disc_pct_recent int;
  -- variant simulation state (1-based)
  nv int := 0;
  v_id uuid[] := '{}';
  v_name text[] := '{}';
  v_price bigint[] := '{}';
  v_cost bigint[] := '{}';
  v_avg bigint[] := '{}';
  v_onh int[] := '{}';
  v_vel double precision[] := '{}';
  v_lead int[] := '{}';
  v_pack int[] := '{}';
  v_scen text[] := '{}';
  v_pending_qty int[] := '{}';
  v_pending_day int[] := '{}';
  -- generated rows
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
  first_names text[] := array['Ayu','Dewi','Rina','Putri','Sinta','Wulan','Indah','Lestari','Nadia','Fitri','Maya','Ratna',
                              'Budi','Andi','Rizky','Fajar','Dimas','Yoga','Bayu','Hendra','Siska','Tari','Mega','Lina'];
  -- loop scratch
  d int; k int; j int; u int; x int;
  day_date date;
  wd int;
  factor double precision;
  recent boolean;
  units int[];
  demand int;
  order_size int;
  o_vars int[];
  o_qtys int[];
  ch int;
  r double precision;
  acc double precision;
  sub bigint;
  disc bigint;
  fee bigint;
  gross bigint[];
  a_disc bigint[];
  a_fee bigint[];
  sale_id uuid;
  cust uuid;
  at_ts timestamptz;
  max_minute int;
  minute int;
  pay text;
  story_floor int := 7;
  story_start int;
  forced int[] := array[2,3,2,3,2,3,2,3,2,3,2,2];
  q int;
  unit_cost bigint;
  prod_id uuid;
  prod_var uuid;
  e jsonb;
  lbl text;
  total_units int;
begin
  select * into t from public.tenants where id = p_tenant;
  if not found then raise exception 'seed_demo: tenant % not found', p_tenant; end if;
  tz := t.timezone;
  local_now := now() at time zone tz;
  today := local_now::date;
  start_day := today - (days - 1);
  story_start := days - 12;
  perform setseed(case p_profile when 'kopi' then 0.271 else 0.137 end);

  -- Channels: demo fees (TikTok includes affiliate commission).
  update public.channels set fee_pct = 18, fee_fixed = 1000
   where tenant_id = p_tenant and kind = 'tiktok_shop';

  if p_profile = 'kopi' then
    select array_agg(id order by array_position(array['pos','gofood','whatsapp']::public.channel_kind[], kind)),
           array_agg(kind::text order by array_position(array['pos','gofood','whatsapp']::public.channel_kind[], kind)),
           array_agg(fee_pct order by array_position(array['pos','gofood','whatsapp']::public.channel_kind[], kind)),
           array_agg(fee_fixed order by array_position(array['pos','gofood','whatsapp']::public.channel_kind[], kind))
      into ch_ids, ch_kind, ch_fee_pct, ch_fee_fixed
      from public.channels where tenant_id = p_tenant and kind in ('pos','gofood','whatsapp');
    ch_w_normal := array[0.58, 0.32, 0.10];
    ch_w_recent := array[0.50, 0.42, 0.08];
    disc_p_normal := 0.06; disc_pct_normal := 10; disc_p_recent := 0.25; disc_pct_recent := 20;
    catalog := '[
      {"n":"Es Kopi Susu Gula Aren","c":"Kopi","e":"🧋","p":22000,"h":7500,"v":14,"l":1,"k":20},
      {"n":"Kopi Susu Pandan","c":"Kopi","e":"🥤","p":24000,"h":8200,"v":6,"l":1,"k":20},
      {"n":"Americano","c":"Kopi","e":"☕","p":18000,"h":5000,"v":7,"l":1,"k":20},
      {"n":"Cappuccino","c":"Kopi","e":"☕","p":25000,"h":8000,"v":5,"l":1,"k":20},
      {"n":"Caffe Latte","c":"Kopi","e":"☕","p":25000,"h":8500,"v":6,"l":1,"k":20},
      {"n":"Matcha Latte","c":"Non-kopi","e":"🍵","p":27000,"h":10500,"v":4,"l":2,"k":20},
      {"n":"Coklat Dingin","c":"Non-kopi","e":"🍫","p":23000,"h":8000,"v":3.5,"l":2,"k":20},
      {"n":"Teh Tarik","c":"Non-kopi","e":"🧉","p":18000,"h":5500,"v":3,"l":2,"k":20},
      {"n":"Roti Bakar","c":"Makanan","e":"🍞","p":20000,"h":8000,"v":4,"l":1,"k":10,"o":["Coklat","Keju"]},
      {"n":"Croissant Butter","c":"Makanan","e":"🥐","p":22000,"h":11000,"v":3,"l":2,"k":12},
      {"n":"Kentang Goreng","c":"Makanan","e":"🍟","p":19000,"h":7000,"v":4,"l":2,"k":10},
      {"n":"Pisang Goreng Keju","c":"Makanan","e":"🍌","p":17000,"h":6000,"v":3,"l":1,"k":10},
      {"n":"Nasi Ayam Sambal Matah","c":"Makanan","e":"🍛","p":32000,"h":15000,"v":4,"l":1,"k":10},
      {"n":"Biji Kopi House Blend 200g","c":"Retail","e":"🫘","p":85000,"h":42000,"v":0.6,"l":5,"k":10},
      {"n":"Kopi Susu Botol 1L","c":"Retail","e":"🍶","p":95000,"h":38000,"v":0.8,"l":2,"k":6},
      {"n":"Tumbler Kopi Dimas","c":"Retail","e":"🥤","p":120000,"h":65000,"v":0.4,"l":7,"k":6,"s":"slow"},
      {"n":"Drip Bag Isi 10","c":"Retail","e":"📦","p":65000,"h":28000,"v":0.35,"l":7,"k":10,"s":"slow"}
    ]'::jsonb;
  else
    select array_agg(id order by array_position(array['pos','whatsapp','shopee','tiktok_shop']::public.channel_kind[], kind)),
           array_agg(kind::text order by array_position(array['pos','whatsapp','shopee','tiktok_shop']::public.channel_kind[], kind)),
           array_agg(fee_pct order by array_position(array['pos','whatsapp','shopee','tiktok_shop']::public.channel_kind[], kind)),
           array_agg(fee_fixed order by array_position(array['pos','whatsapp','shopee','tiktok_shop']::public.channel_kind[], kind))
      into ch_ids, ch_kind, ch_fee_pct, ch_fee_fixed
      from public.channels where tenant_id = p_tenant and kind in ('pos','whatsapp','shopee','tiktok_shop');
    ch_w_normal := array[0.12, 0.18, 0.40, 0.30];
    ch_w_recent := array[0.10, 0.15, 0.30, 0.45];
    disc_p_normal := 0.08; disc_pct_normal := 10; disc_p_recent := 0.35; disc_pct_recent := 15;
    catalog := '[
      {"n":"Serum Vit C 20ml","c":"Serum","e":"🍊","p":89000,"h":38000,"v":2.4,"l":3,"k":10,"m":10,"s":"story","d":"Serum vitamin C 10% untuk mencerahkan dan meratakan warna kulit."},
      {"n":"Serum Niacinamide 10%","c":"Serum","e":"💧","p":79000,"h":32000,"v":3,"l":4,"k":10,"m":10,"d":"Membantu menyamarkan noda bekas jerawat dan mengontrol minyak."},
      {"n":"Retinol Serum 0.3%","c":"Serum","e":"🌙","p":110000,"h":50000,"v":0.9,"l":7,"k":6,"d":"Retinol ringan untuk pemula, dipakai malam hari."},
      {"n":"Brightening Essence 100ml","c":"Serum","e":"✨","p":105000,"h":46000,"v":0.8,"l":7,"k":6},
      {"n":"Hyaluronic Toner 100ml","c":"Toner","e":"🫧","p":65000,"h":26000,"v":2.5,"l":4,"k":12,"d":"Toner hidrasi untuk semua jenis kulit."},
      {"n":"Exfoliating Toner AHA BHA","c":"Toner","e":"🧪","p":85000,"h":36000,"v":1.4,"l":5,"k":12},
      {"n":"Toner Pad 60 Lembar","c":"Toner","e":"🧻","p":89000,"h":37000,"v":1.2,"l":5,"k":12},
      {"n":"Gentle Cleanser 100ml","c":"Pembersih","e":"🧼","p":55000,"h":21000,"v":3,"l":4,"k":12,"d":"Sabun cuci muka pH seimbang, tidak bikin kering."},
      {"n":"Micellar Water 200ml","c":"Pembersih","e":"💦","p":52000,"h":20000,"v":1.6,"l":4,"k":12},
      {"n":"Facial Wash Travel 30ml","c":"Pembersih","e":"🧴","p":25000,"h":9000,"v":1.5,"l":4,"k":24},
      {"n":"Moisturizer Gel 50g","c":"Pelembap","e":"🫙","p":75000,"h":30000,"v":2.5,"l":4,"k":12,"d":"Pelembap gel ringan, cocok untuk kulit berminyak."},
      {"n":"Night Cream 30g","c":"Pelembap","e":"🌜","p":99000,"h":45000,"v":0.9,"l":7,"k":6},
      {"n":"Eye Cream 15g","c":"Pelembap","e":"👁️","p":95000,"h":42000,"v":0.8,"l":7,"k":6},
      {"n":"Sunscreen SPF50 40ml","c":"Sunscreen","e":"☀️","p":69000,"h":29000,"v":4,"l":4,"k":12,"d":"Sunscreen SPF50 PA++++, ringan dan tidak lengket."},
      {"n":"Clay Mask 60g","c":"Masker","e":"🏺","p":59000,"h":23000,"v":1.2,"l":5,"k":12},
      {"n":"Sheet Mask","c":"Masker","e":"🎭","p":15000,"h":5500,"v":2.2,"l":4,"k":30,"o":["Hydrating","Brightening","Soothing"]},
      {"n":"Acne Spot Gel 15g","c":"Perawatan","e":"🎯","p":45000,"h":17000,"v":1.8,"l":4,"k":12},
      {"n":"Lip Serum","c":"Bibir","e":"💋","p":39000,"h":14000,"v":0.9,"l":5,"k":12,"o":["Pink","Nude","Berry"]},
      {"n":"Lip Balm SPF15","c":"Bibir","e":"👄","p":29000,"h":10000,"v":1.4,"l":5,"k":24},
      {"n":"Cushion SPF35","c":"Makeup","e":"🪞","p":129000,"h":58000,"v":0.7,"l":7,"k":6,"o":["01 Light","02 Natural"]},
      {"n":"Body Lotion 200ml","c":"Tubuh","e":"🧴","p":49000,"h":19000,"v":1.5,"l":5,"k":12},
      {"n":"Body Scrub Kopi 200g","c":"Tubuh","e":"☕","p":65000,"h":27000,"v":0.6,"l":7,"k":12,"s":"slow"},
      {"n":"Hair Mist 100ml","c":"Rambut","e":"🌸","p":59000,"h":24000,"v":0.6,"l":7,"k":12,"s":"slow"},
      {"n":"Paket Glowing (Serum+Toner+Moisturizer)","c":"Paket","e":"🎁","p":199000,"h":86000,"v":0.6,"l":5,"k":6},
      {"n":"Mini Pouch Glow","c":"Merchandise","e":"👝","p":20000,"h":0,"v":0.5,"l":7,"k":20,"x":true}
    ]'::jsonb;
  end if;

  -- -- Catalog + opening stock ------------------------------------------------
  for e in select value from jsonb_array_elements(catalog) loop
    insert into public.products (tenant_id, name, category, description, image_path, unit)
    values (p_tenant, e->>'n', e->>'c', e->>'d', e->>'e', case when e->>'c' in ('Kopi','Non-kopi','Makanan') then 'porsi' else 'pcs' end)
    returning id into prod_id;

    for lbl in select coalesce(value #>> '{}', '') from jsonb_array_elements(coalesce(e->'o', '[null]'::jsonb)) loop
      nv := nv + 1;
      insert into public.variants (tenant_id, product_id, sku, option_label, price, avg_cost, cost_is_set,
                                   min_stock, lead_time_days, pack_size)
      values (p_tenant, prod_id,
              upper(left(regexp_replace(e->>'n', '[^A-Za-z]', '', 'g'), 4)) || '-' || lpad(nv::text, 3, '0'),
              nullif(lbl, ''), (e->>'p')::bigint, (e->>'h')::bigint, coalesce((e->>'x')::boolean, false) = false,
              coalesce((e->>'m')::int, 5), (e->>'l')::int, (e->>'k')::int)
      returning id into prod_var;
      v_id[nv] := prod_var;
      v_name[nv] := (e->>'n') || coalesce(' — ' || nullif(lbl, ''), '');
      v_price[nv] := (e->>'p')::bigint;
      v_cost[nv] := (e->>'h')::bigint;
      v_avg[nv] := (e->>'h')::bigint;
      v_vel[nv] := (e->>'v')::double precision;
      v_lead[nv] := (e->>'l')::int;
      v_pack[nv] := (e->>'k')::int;
      v_scen[nv] := coalesce(e->>'s', 'normal');
      v_pending_qty[nv] := 0;
      v_pending_day[nv] := -1;
      -- Opening stock the day before the window: ~30 days of demand (slow movers: plenty).
      v_onh[nv] := (ceil(v_vel[nv] * case when v_scen[nv] = 'slow' then 90 else 30 end / v_pack[nv]) * v_pack[nv])::int;
      m_n := m_n + 1;
      m_var[m_n] := v_id[nv]; m_qty[m_n] := v_onh[nv]; m_kind[m_n] := 'purchase'; m_cost[m_n] := v_cost[nv];
      m_ref[m_n] := null; m_at[m_n] := ((start_day - 1) + time '08:00') at time zone tz;
    end loop;
  end loop;

  -- -- Day-by-day simulation -------------------------------------------------
  for d in 0..days - 1 loop
    day_date := start_day + d;
    wd := extract(isodow from day_date)::int;  -- 1 Mon ... 7 Sun
    factor := case wd when 5 then 1.10 when 6 then 1.30 when 7 then 1.25 when 1 then 0.85 else 1.0 end
              * case when extract(day from day_date) between 25 and 28 then 1.15 else 1.0 end;
    recent := d >= days - 7;
    if day_date = today then
      -- Only the part of today that already happened: every order lands at least
      -- a minute before now (also right after midnight, when the day has barely begun).
      max_minute := greatest(1, (extract(hour from local_now) * 60 + extract(minute from local_now))::int - 1);
      if max_minute <= 8 * 60 then
        factor := factor * greatest(0.02, max_minute / 480.0 * 0.15);
      else
        factor := factor * least(1.0, greatest(0.15, (max_minute - 480) / 840.0));
      end if;
    else
      max_minute := 22 * 60;
    end if;

    -- Restock arrivals at 08:00.
    for k in 1..nv loop
      if v_pending_day[k] = d and v_pending_qty[k] > 0 then
        unit_cost := v_cost[k];
        v_avg[k] := app.weighted_avg_cost(v_onh[k], v_avg[k], v_pending_qty[k], unit_cost);
        v_onh[k] := v_onh[k] + v_pending_qty[k];
        m_n := m_n + 1;
        m_var[m_n] := v_id[k]; m_qty[m_n] := v_pending_qty[k]; m_kind[m_n] := 'purchase'; m_cost[m_n] := unit_cost;
        m_ref[m_n] := null; m_at[m_n] := (day_date + time '08:00') at time zone tz;
        v_pending_qty[k] := 0; v_pending_day[k] := -1;
      end if;
    end loop;

    -- Units demanded today, per variant (sold only while in stock).
    units := '{}';
    for k in 1..nv loop
      if v_scen[k] = 'story' and d = days - 1 then
        -- Today closes the story exactly on story_floor, whatever came before.
        demand := greatest(0, v_onh[k] - story_floor);
      elsif v_scen[k] = 'story' and d >= story_start then
        demand := forced[d - story_start + 1];
      elsif v_scen[k] = 'slow' and d >= 50 then
        demand := 0;
      else
        demand := app.rand_poisson(v_vel[k] * factor);
      end if;
      if v_scen[k] = 'story' and d >= story_start then
        demand := least(demand, greatest(0, v_onh[k] - story_floor));
      else
        demand := least(demand, greatest(0, v_onh[k]));
      end if;
      for u in 1..demand loop units := units || k; end loop;
    end loop;

    -- Shuffle (Fisher-Yates) and pack units into orders of 1-3 lines.
    total_units := coalesce(array_length(units, 1), 0);
    for u in reverse total_units..2 loop
      j := 1 + floor(random() * u)::int;
      x := units[u]; units[u] := units[j]; units[j] := x;
    end loop;

    u := 1;
    while u <= total_units loop
      r := random();
      order_size := case when r < 0.6 then 1 when r < 0.88 then 2 else 3 end;
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

      -- Channel by weight.
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
      if random() < (case when recent then disc_p_recent else disc_p_normal end) then
        disc := (round(sub * (case when recent then disc_pct_recent else disc_pct_normal end) / 100.0 / 100) * 100)::bigint;
      end if;
      fee := app.estimate_platform_fee(sub - disc, ch_fee_pct[ch], ch_fee_fixed[ch]);
      a_disc := app.alloc_lr(disc, gross);
      a_fee := app.alloc_lr(fee, gross);

      minute := 8 * 60 + floor(random() * greatest(1, max_minute - 8 * 60))::int;
      if day_date = today and max_minute <= 8 * 60 then minute := floor(random() * max_minute)::int; end if;
      at_ts := (day_date + make_interval(mins => minute)) at time zone tz;

      -- Customers: about half of WhatsApp / walk-in orders leave a phone number.
      cust := null;
      if ch_kind[ch] in ('pos', 'whatsapp') and random() < 0.5 then
        if c_n > 0 and random() < 0.6 then
          x := 1 + floor(random() * c_n)::int;
          cust := c_id[x];
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
        when ch_kind[ch] in ('shopee', 'tiktok_shop', 'gofood') then 'marketplace'
        when ch_kind[ch] = 'whatsapp' then case when random() < 0.6 then 'transfer' else 'qris' end
        else case when random() < 0.55 then 'tunai' when random() < 0.8 then 'qris' else 'transfer' end end;

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
        i_cs[i_n] := v_cost[k] > 0;
        m_n := m_n + 1;
        m_var[m_n] := v_id[k]; m_qty[m_n] := -o_qtys[j]; m_kind[m_n] := 'sale'; m_cost[m_n] := v_avg[k];
        m_ref[m_n] := sale_id; m_at[m_n] := at_ts;
        v_onh[k] := v_onh[k] - o_qtys[j];
      end loop;
    end loop;

    -- Replenishment policy at close: order when cover < lead + 4 days.
    for k in 1..nv loop
      if v_scen[k] = 'story' then
        -- One planned restock 12 days before the end, sized so the forced 29 units of
        -- the last 12 days land on story_floor today. Normal ordering stops early
        -- enough that nothing else is in transit by then.
        if d = story_start - 1 then
          q := greatest(0, 29 + story_floor - v_onh[k] - v_pending_qty[k]);
          if q > 0 then v_pending_qty[k] := v_pending_qty[k] + q; v_pending_day[k] := story_start; end if;
          continue;
        end if;
        -- No normal orders in the 3 weeks before, so the shelf runs down and
        -- nothing else is in transit when the planned restock lands.
        continue when d >= story_start - 22;
      end if;
      continue when v_pending_qty[k] > 0 or v_scen[k] = 'slow';
      if v_onh[k] <= v_vel[k] * (v_lead[k] + 4) then
        q := (ceil(v_vel[k] * (v_lead[k] + 21) / v_pack[k]) * v_pack[k])::int;
        v_pending_qty[k] := q;
        v_pending_day[k] := d + v_lead[k];
      end if;
    end loop;
  end loop;

  -- -- Bulk insert -----------------------------------------------------------
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

  -- -- Expenses: weekly on Mondays, monthly on the 25th ----------------------
  insert into public.expenses (tenant_id, category, amount, occurred_at, note)
  select p_tenant, x.category, x.amount, x.day, x.note
    from (
      select dd::date as day, 'Iklan' as category, case when p_profile = 'kopi' then 250000 else 350000 end as amount,
             'Iklan mingguan' as note
        from generate_series(start_day, today, interval '1 day') dd where extract(isodow from dd) = 1
      union all
      select dd::date, case when p_profile = 'kopi' then 'Bahan/Stok non-katalog' else 'Ongkir' end,
             case when p_profile = 'kopi' then 450000 else 200000 end,
             case when p_profile = 'kopi' then 'Susu, es, gula' else 'Plastik & bubble wrap' end
        from generate_series(start_day, today, interval '1 day') dd where extract(isodow from dd) = 1
      union all
      select dd::date, m.category, m.amount, m.note
        from generate_series(start_day, today, interval '1 day') dd
        cross join (values ('Sewa', 2500000::bigint, 'Sewa tempat'),
                           ('Gaji', case when p_profile = 'kopi' then 9000000 else 6000000 end::bigint, 'Gaji karyawan'),
                           ('Listrik & Air', 650000::bigint, 'Listrik, air, internet')) as m(category, amount, note)
       where extract(day from dd) = 25
    ) x;

  perform app.seed_demo_kb(p_tenant, p_profile);
  -- Don't leave the (pooled) session's random() on a fixed sequence.
  perform setseed((extract(microseconds from clock_timestamp())::int % 1000000) / 500000.0 - 1);
end $$;
