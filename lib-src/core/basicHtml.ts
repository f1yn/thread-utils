export const templateTop = (title: string) => `
	<!doctype html>
	<html lang="en">
	<head>
	  <meta charset="utf-8">
	  <meta name="viewport" content="width=device-width">
	  <title>${title}</title>
	  <style>
	  	img { max-width: 256px; height: auto; }
	  	div {
	  		display: flex;
	  		flex-wrap: wrap;
	  	}
	  	div article {
	  		margin: 20px;
	  	}
	  	article > b {
	  		display: block;
	  	}
	  </style>
	</head>
	<body>
`;

export const imageGroup = (groupIdentifier: any, images: any[]) => {
	const output = [
		`<section id="${groupIdentifier}">`,
		`<h2>${groupIdentifier}</h2>`,
		`<div>`,
		...images.map((image) =>
			[
				`<article>`,
				`<img src="/${image.path}" />`,
				`<b>${image.bytes}</b>`,
				`</article>`,
			].join('\n')
		),
		`</div>`,
	];

	return output.join('\n');
};

export const templateBottom = () => `</body>`;
