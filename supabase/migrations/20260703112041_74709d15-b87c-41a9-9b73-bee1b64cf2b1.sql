UPDATE polygraph_appointments pa
SET status = 'completed'
FROM polygraph_appointment_candidates pac, pending_polygraph_uploads pu
WHERE pa.id = pac.appointment_id
  AND pu.id_number = pac.candidate_id_number
  AND pu.status = 'approved'
  AND pa.status <> 'completed';