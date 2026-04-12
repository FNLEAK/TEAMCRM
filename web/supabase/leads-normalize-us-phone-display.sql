-- One-time: normalize US NANP numbers in leads.phone to (XXX)-XXX-XXXX.
-- Safe to re-run: only updates rows where stripped digits are 10 or 11 (leading 1).
-- Run in Supabase SQL after backup if desired.

update public.leads l
set phone = '(' || substring(x.d from 1 for 3) || ')-' || substring(x.d from 4 for 3) || '-' || substring(x.d from 7 for 4)
from (
  select
    id,
    case
      when length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) = 11
        and left(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 1) = '1'
        then substring(regexp_replace(coalesce(phone, ''), '\D', '', 'g') from 2 for 10)
      when length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) = 10
        then regexp_replace(coalesce(phone, ''), '\D', '', 'g')
      else null
    end as d
  from public.leads
) x
where l.id = x.id
  and x.d is not null
  and length(x.d) = 10
  and (l.phone is null or l.phone !~ '^\([0-9]{3}\)-[0-9]{3}-[0-9]{4}$');
