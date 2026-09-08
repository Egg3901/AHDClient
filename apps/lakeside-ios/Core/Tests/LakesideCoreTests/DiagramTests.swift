import XCTest
@testable import LakesideCore

final class DiagramTests: XCTestCase {
    func testServerChartPreservesLabelsValuesAndUnits() {
        let chart = Diagram("xychart-beta\n title \"GDP growth\"\n x-axis [\"US, total\",\"UK\"]\n y-axis \"Percent\" -2 --> 5\n bar [-1.5, 4]")
        XCTAssertEqual(chart.kind, "xy"); XCTAssertEqual(chart.axis, "Percent")
        XCTAssertEqual(chart.labels, ["US, total", "UK"]); XCTAssertEqual(chart.series.first?.values, [-1.5, 4])
    }
    func testPieAndLabeledRelationship() {
        XCTAssertEqual(Diagram("pie showData title \"Output\"\n\"Iron\" : 12.5\n\"Steel\" : 5").series.first?.values, [12.5, 5])
        let graph = Diagram("flowchart LR\nA[Demand] -->|raises| B[Price]")
        XCTAssertEqual(graph.edges.first?.from, "Demand"); XCTAssertEqual(graph.edges.first?.to, "Price"); XCTAssertEqual(graph.edges.first?.label, "raises")
    }
    func testMismatchedSeriesIsNotSilentlyReinterpreted() {
        XCTAssertEqual(Diagram("xychart-beta\nx-axis [\"A\",\"B\"]\nbar [1]").kind, "unsupported")
    }
}
