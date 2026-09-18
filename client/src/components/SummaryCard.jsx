function SummaryCard({ summary }) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(summary.summary)
  }

  return (
    <div className="mt-6 bg-white rounded-lg shadow p-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-4">Article: {summary.title}</h3>
      
      <div className="mb-4">
        <h4 className="font-semibold text-gray-700 mb-2">AI Summary</h4>
        <p className="text-gray-600">{summary.summary}</p>
      </div>

      <div className="mb-4">
        <h4 className="font-semibold text-gray-700 mb-2">Key Points</h4>
        <ul className="list-disc list-inside text-gray-600">
          {summary.keyPoints.map((point, idx) => (
            <li key={idx}>{point}</li>
          ))}
        </ul>
      </div>

      <div className="text-sm text-gray-500">
        <p>Topic: {summary.topic}</p>
        <p>Source: {summary.url}</p>
        <p>Generated: {new Date(summary.createdAt).toLocaleString()}</p>
      </div>

      <button
        onClick={copyToClipboard}
        className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
      >
        Copy Summary
      </button>
    </div>
  )
}

export default SummaryCard
