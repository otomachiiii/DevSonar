package devsonar

// RecoverAndReport recovers from a panic, reports it to DevSonar, and re-panics.
// Use with defer:
//
//	func main() {
//	    reporter := devsonar.New()
//	    defer devsonar.RecoverAndReport(reporter, "main")
//	    // ...
//	}
func RecoverAndReport(reporter *Reporter, source string) {
	if recovered := recover(); recovered != nil {
		reporter.ReportPanic(recovered, source)
		panic(recovered)
	}
}
