{{- define "collabboard.labels" -}}
app.kubernetes.io/part-of: collabboard
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}