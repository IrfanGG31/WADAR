-- Box-Muller standard normal and a small Poisson sampler (Knuth; normal approx. for large lambda).
create or replace function app.rand_normal() returns double precision
language sql volatile set search_path = '' as $$
  select sqrt(-2 * ln(greatest(random(), 1e-12))) * cos(2 * pi() * random())
$$;

create or replace function app.rand_poisson(p_lambda double precision) returns int
language plpgsql volatile set search_path = '' as $$
declare
  l double precision;
  k int := 0;
  p double precision := 1;
begin
  if p_lambda <= 0 then return 0; end if;
  if p_lambda > 30 then
    return greatest(0, round(p_lambda + sqrt(p_lambda) * app.rand_normal()))::int;
  end if;
  l := exp(-p_lambda);
  loop
    p := p * random();
    exit when p <= l;
    k := k + 1;
  end loop;
  return k;
end $$;
