export default function CommentPlaceholder() {
	return (
		<div
			className="bg-white/30 px-4 pb-4 mb-2 shadow-xl ring-1 ring-gray-900/5 rounded-lg backdrop-blur-lg max-w-xl mx-auto w-full"
		>
			<div
				className="flex flex-col"
			>
				<div
					className="flex items-center py-3"
				>
					<div className="h-12 w-12 mr-3 rounded-full bg-gray-200 animate-pulse" />
					<div className="h-4 w-36 rounded-md bg-gray-200 animate-pulse" />
					<div className="h-4 w-24 ml-auto rounded-md bg-gray-200 animate-pulse" />
				</div>
				<div className="h-4 w-full ml-auto rounded-md bg-gray-200 animate-pulse" />
			</div>
		</div>
	)
}
