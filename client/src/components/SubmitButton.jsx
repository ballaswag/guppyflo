import SpinnerIcon from '../assets/images/spinner.svg?react'
import { useFormStatus } from "react-dom"


function Button({children, ...rest}) {
    const { pending, action } = useFormStatus()

    return (
        <button className="button"
        disabled={pending && action === rest.formAction}
        {...rest} >
        {pending && action === rest.formAction
            ? (<SpinnerIcon className='w-6 h-6 text-gray-300 animate-spin'/>)
            : children}
      </button>
    )
}

export default Button
