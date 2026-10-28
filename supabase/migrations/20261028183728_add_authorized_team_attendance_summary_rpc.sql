-- Read-only registered-team check-in progress for members and trusted event staff.
-- No public attendance, no player/roster identifiers, no email or game UIDs.
-- Locks the tournament before the entry, matching check-in / no-show write paths
-- and providing a count after an in-flight check-in completes.

CREATE FUNCTION public.get_team_attendance_summary(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_uid uuid:=auth.uid();
 v_jwt jsonb:=auth.jwt();
 v_tournament_id uuid;
 v_t public.tournaments%ROWTYPE;
 v_e public.tournament_entries%ROWTYPE;
 v_trusted_role text;
 v_authorized boolean:=false;
 v_required integer;
 v_checked_in integer;
 v_pending integer;
 v_no_show integer;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated'
 OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR NOT EXISTS(SELECT 1 FROM auth.users u
 WHERE u.id=v_uid AND u.is_anonymous=false AND u.deleted_at IS NULL)
 THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','UNAUTHENTICATED',
   'message','Sign in to see team attendance.');
 END IF;
 IF p_entry_id IS NULL THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVALID_ENTRY_ID',
   'message','A tournament entry ID is required.');
 END IF;

 -- Do not disclose whether an inaccessible entry exists.
 SELECT e.tournament_id INTO v_tournament_id
 FROM public.tournament_entries e
 WHERE e.id=p_entry_id AND e.team_id IS NOT NULL;
 IF v_tournament_id IS NULL THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','ENTRY_NOT_FOUND',
   'message','Team attendance is not available for this entry.');
 END IF;

 SELECT * INTO v_t FROM public.tournaments t
 WHERE t.id=v_tournament_id FOR SHARE;
 IF NOT FOUND THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','ENTRY_NOT_FOUND',
   'message','Team attendance is not available for this entry.');
 END IF;
 SELECT * INTO v_e FROM public.tournament_entries e
 WHERE e.id=p_entry_id AND e.tournament_id=v_t.id AND e.team_id IS NOT NULL
 FOR SHARE;
 IF NOT FOUND THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','ENTRY_NOT_FOUND',
   'message','Team attendance is not available for this entry.');
 END IF;

 v_authorized:=EXISTS(
  SELECT 1 FROM public.tournament_entry_participants p
  WHERE p.entry_id=v_e.id AND p.user_id=v_uid
 );
 IF v_authorized IS DISTINCT FROM true THEN
   v_authorized:=EXISTS(
     SELECT 1 FROM public.tournament_staff s
     WHERE s.tournament_id=v_t.id
       AND s.user_id=v_uid AND s.staff_role='referee'
   );
 END IF;
 IF v_authorized IS DISTINCT FROM true THEN
  SELECT raw_app_meta_data->>'tretmax_role' INTO v_trusted_role
  FROM auth.users WHERE id=v_uid;
  v_authorized:=(
     v_trusted_role='owner'
     AND v_jwt->'app_metadata'->>'tretmax_role'='owner'
   ) OR (
     v_trusted_role='tournament_manager'
     AND v_jwt->'app_metadata'->>'tretmax_role'='tournament_manager'
     AND v_t.created_by=v_uid
   );
 END IF;
 IF v_authorized IS DISTINCT FROM true THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','ENTRY_NOT_FOUND',
   'message','Team attendance is not available for this entry.');
 END IF;

 SELECT count(*)::integer,
        count(*) FILTER (WHERE p.attendance_status='checked_in')::integer,
        count(*) FILTER (WHERE p.attendance_status='pending')::integer,
        count(*) FILTER (WHERE p.attendance_status='no_show')::integer
 INTO v_required,v_checked_in,v_pending,v_no_show
 FROM public.tournament_entry_participants p WHERE p.entry_id=v_e.id;

 RETURN pg_catalog.jsonb_build_object(
  'ok',true,'code','ATTENDANCE_AVAILABLE',
  'message','Team attendance summary available.',
  'tournament_id',v_t.id,
  'team_id',v_e.team_id,
  'entry_id',v_e.id,
  'entry_status',v_e.status,
  'required_count',v_required,
  'checked_in_count',v_checked_in,
  'pending_count',v_pending,
  'no_show_count',v_no_show,
  'entry_checked_in',(v_e.status='checked_in' AND v_required>0 AND v_required=v_checked_in),
  'check_in_opens_at',v_t.check_in_opens_at,
  'check_in_closes_at',v_t.check_in_closes_at,
  'server_time',pg_catalog.clock_timestamp()
 );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_team_attendance_summary(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_attendance_summary(uuid)
 TO authenticated;
