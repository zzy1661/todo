import React, { Component } from 'react';
import Utils from '../utils';

class Timer extends Component {

    state = {
        date: new Date() 
    }

    componentDidMount () {
        this.timerId = setInterval(() => this.updatime(),1000)
    }

    componentWillUnmount() {
        clearInterval(this.timerId);
    }

    updatime = () => {
        this.setState({
            date: new Date()
        })
    }

    render () {
        return (
            <span>{Utils.dateFormat(this.state.date,'yyyy-MM-dd HH:mm:ss')} </span>
        )
    }
}

export default Timer;